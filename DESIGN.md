# open-tag

An open-source, model-agnostic, platform-agnostic alternative to [Anthropic's Claude Tag](https://www.anthropic.com/news/introducing-claude-tag) — a persistent AI teammate that lives in your team chat.

Where Claude Tag is **Slack-only** and **Opus-only**, open-tag runs on **Telegram, Discord, Slack, …** and any model (**Anthropic, OpenAI, Gemini, local/Ollama**). Those two seams are the whole point.

**We build on top of an existing agent harness rather than rolling our own.** The agent
loop, durable execution, subagents and sandboxes are solved problems — [Flue](https://flueframework.com/)
(Apache-2.0, `withastro/flue`, powered by the Pi harness) gives us all of that. Model
fan-out is solved too — [Vercel AI Gateway](https://vercel.com/ai-gateway/models) is one
key, every provider, with routing + fallback. So open-tag is **not an agent framework**;
it's the thin **multiplayer team-chat product layer** that those two don't provide:
shared per-channel sessions, ambient mode, the Telegram channel, and per-channel policy.

---

## 1. What we're actually building

Claude Tag's value isn't "a chatbot in chat." It's five properties. open-tag targets all five:

1. **One shared agent per channel** (multiplayer) — state keyed by channel, not per-user DM. Everyone sees the same agent working; anyone continues the thread.
2. **Ambient / proactive mode** — watches channels, decides on its own when to interject, flag things, chase forgotten threads.
3. **Long-running async + self-scheduling** — runs a task over hours/days, schedules follow-ups for itself.
4. **Contextual memory** — learns from channel history + connected data; stop re-explaining.
5. **Per-channel permissioned connectors** — admins scope which tools/data/codebases each channel can touch.

A normal bot does none of 1–5. Those are the build.

---

## 2. Architecture

Three layers. The bottom two we **adopt** (Flue + AI Gateway). The top one — the product —
is what open-tag actually is.

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│Telegram chan │  │Discord chan  │  │ Slack channel│   ← platform seam  (OURS for Telegram;
│  (grammY)    │  │              │  │ (Flue ships) │      Flue ships Slack/Linear/GitHub)
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       └─────────────────┼─────────────────┘
                 Normalized Event Bus
            (IncomingMessage / Reaction / Edit)
                         │
   ┌─────────────────────┴──────────────────────┐
   │     open-tag PRODUCT LAYER  (what we build) │
   │  • shared per-channel session (the actor)   │
   │  • ambient trigger evaluator                │
   │  • per-channel permission policy            │
   │  • channelId → Flue session mapping         │
   └─────────────────────┬──────────────────────┘
                         │ defineAgent / run
   ┌─────────────────────┴──────────────────────┐
   │   FLUE + Pi harness   (adopt, Apache-2.0)   │
   │  agent loop · subagents · sandboxes ·       │
   │  durable execution · tools/skills (+ MCP)   │
   └─────────────────────┬──────────────────────┘
                         │ provider/model string
              ┌──────────┴───────────┐
              │  Vercel AI Gateway   │  ← model seam (adopt): one key,
              │  every provider,     │     every provider, routing + fallback
              │  routing + fallback  │
              └──────────────────────┘

   Postgres + pgvector  ──  channel state · RBAC · semantic recall  (Flue `add database postgres`)
```

The platform seam stays **ours** (normalized adapter interface) so we control multiplayer
semantics uniformly — even for the channels Flue already ships. New platform = one adapter.
New model = a string change at the gateway.

---

## 3. Stack (TypeScript / Node)

| Layer | Pick | Build or adopt | Why |
|---|---|---|---|
| Agent core | **Flue** (`withastro/flue`) + Pi harness | **adopt** | Apache-2.0, self-hostable; gives the agent loop, subagents, sandboxes, durable execution out of the box |
| Model gateway | **Vercel AI Gateway** (behind Flue/Pi as the provider) | **adopt** | One API key, every provider, routing + fallback; `provider/model` format matches Flue/Pi |
| Platform — Telegram | **grammY** as a custom Flue **channel** (`flue add channel` blueprint) | **build** | Flue has Slack/Linear/GitHub but no Telegram; this is our first-class target |
| Platform — others | Flue's **Slack** channel; **discord.js** adapter | adopt / build | Reuse where Flue ships; wrap in our normalized interface |
| Connectors | **MCP** servers surfaced as Flue tools/skills | adopt | Maps 1:1 to Tag's "connect tools/data/codebases" |
| State / memory | **Postgres + pgvector** (`flue add database postgres`) | build (schema) | Shared channel sessions, RBAC, semantic recall |
| Runtime | Node 20+, TypeScript, **pnpm** | — | Flue is runtime-agnostic (Node / Cloudflare / CI) |

**Net effect:** durable execution, subagents, sandboxes, and model fan-out are no longer
ours to build. We build the *product layer* and the *Telegram channel*.

---

## 4. Core contracts

### 4.1 Inbound (platform → core)

Every platform event normalizes to one shape:

```ts
interface IncomingMessage {
  platform: 'telegram' | 'discord' | 'slack'
  channelId: string          // session key component
  threadId?: string          // reply/thread anchor
  messageId: string
  userId: string
  userDisplay: string
  text: string
  mentionsBot: boolean        // explicit @mention vs ambient
  attachments: Attachment[]
  caps: PlatformCaps          // capability flags, see below
  raw: unknown                // escape hatch to native payload
}

interface PlatformCaps {
  threads: boolean            // native threads (Slack/Discord) vs replies (Telegram)
  editMessages: boolean       // can we stream by editing in place?
  richBlocks: boolean         // Slack blocks / Discord embeds
  maxMessageLen: number       // chunking threshold
}
```

### 4.2 Outbound (core → platform)

The asymmetric part. Core emits **markdown + intent**; the adapter owns formatting
(Telegram MarkdownV2 vs Discord markdown vs Slack mrkdwn) and "streaming" = editing a
message in place (`editMessageText` / `msg.edit` / `chat.update`), throttled.

```ts
interface PlatformAdapter {
  start(): Promise<void>
  onMessage(handler: (m: IncomingMessage) => void): void
  send(channelId: string, content: OutboundContent, opts?: SendOpts): Promise<MessageHandle>
  edit(handle: MessageHandle, content: OutboundContent): Promise<void>   // streaming updates
  react?(handle: MessageHandle, emoji: string): Promise<void>            // "working…" affordance
}
```

A `StreamRenderer` wraps `send`/`edit` to push progressive output at a safe edit rate
(Telegram ~1 edit/sec; chunk on `maxMessageLen`).

### 4.3 Agent invocation (Flue)

We don't write a model gateway — we call a Flue agent and let Pi run the loop. The model is
just a `provider/model` string resolved by the AI Gateway, so cheap-model-for-ambient vs
strong-model-for-work is a one-field change.

```ts
// agents/teammate.ts — a Flue agent, model resolved via AI Gateway
export default defineAgent((ctx) => ({
  model: ctx.channel.modelForTask,        // e.g. 'anthropic/claude-opus-4-8' or 'openai/gpt-...'
  instructions: buildSystemPrompt(ctx),   // channel memory + persona injected by us
  tools: ctx.allowedTools,                // MCP/Flue tools gated by our permission policy
}))

// product layer drives it
const handle = await renderer.open(msg.channelId)       // outbound streaming message
await runAgent('teammate', {
  session: sessionIdFor(msg.channelId),   // SHARED per channel — the multiplayer key
  input: msg.text,
  onDelta: (t) => renderer.push(handle, t),
})
```

Model-agnosticism is two layers: the **gateway** picks the provider, the **agent def**
picks the model per task. Neither touches platform or product code.

---

## 5. How each hard part is solved

**Multiplayer state.** Session key = `(platform, channelId)`. One agent context per channel,
guarded by a per-channel **actor/lock** so concurrent @mentions serialize instead of racing
shared memory. This single choice is what separates open-tag from a normal bot.

**Ambient mode.** Every channel message (not just @mentions) runs a cheap "should I act?"
classifier (small model or rules). If yes → enqueue an agent turn. Gated hard by per-channel
config + rate limits so it isn't noisy. Default: off until enabled per channel.

**Async + self-scheduling.** This is **Flue's durable execution** — sessions are recorded in
durable streams and resume automatically after a restart; we don't hand-roll checkpointing.
We add a `schedule_task(when, instruction)` tool that enqueues a future Flue run for the
channel session. Multi-hour tasks survive process death because Pi owns the loop state.

**Permissions.** `channel → { allowed MCP servers, allowed tools, data scopes }` table,
enforced at the gateway **before** any tool runs. Default deny.

**Memory.** Per-channel rolling summary + raw history in Postgres, plus pgvector embeddings
for semantic recall ("what did we decide about X"). Injected into the system prompt per turn,
budget-trimmed.

---

## 6. Data model (sketch)

```
channels(id, platform, external_id, settings_json, ambient_enabled)
messages(id, channel_id, user_id, role, text, embedding vector, ts)
sessions(channel_id, summary, updated_at)              -- rolling context
tasks(id, channel_id, status, instruction, state_json, run_at, parent_id)
connectors(id, channel_id, mcp_server, config_json)    -- per-channel
permissions(channel_id, tool, allow)                   -- default deny
```

---

## 7. Roadmap (Telegram-first)

0. **Spike** — `flue init` a hello-world agent, point its provider at the AI Gateway, confirm
   a model swap is one string. De-risks the two adopted layers before we build on them.
1. **Spine** — normalized event model + **grammY Telegram channel** + shared per-channel
   session → Flue agent with 2–3 MCP tools → streamed reply (edit-in-place). Proves the vertical.
2. **Second platform** — wrap **Flue's Slack channel** (or a discord.js adapter) in the same
   normalized interface. If the product layer needs zero changes, the seam is right.
3. **Durable tasks + self-scheduling** — lean on Flue durable execution; add the
   `schedule_task` tool. (Mostly wiring, not building — that's the point of adopting Flue.)
4. **Ambient mode + per-channel memory** — triage classifier on non-mentions, pgvector recall.
5. **Permissions + admin + model-picker** — RBAC over tools/connectors, per-channel model config.

MVP = step 1 (after the step-0 spike). Everything after is additive and never touches the
adapter contract.

---

## 8. Open questions / decisions deferred

**Resolved by the step-0 spike (see `SPIKE.md`):**
- ✅ **Pi is fully self-hostable.** No Vercel-hosted control plane required — `@flue/runtime`
  bundles `just-bash`, an in-process sandbox; the agent loop and session durability run locally.
  Only an LLM API key is needed. *Caveat:* `just-bash` has no VM isolation — for production
  shell-tool use, wrap the process in Docker or use the `cloudflare` target.
- ✅ **AI Gateway ↔ Pi wiring works** via `registerProvider('anthropic', { baseUrl, apiKey })`,
  redirecting Pi's built-in provider through the Gateway's OpenAI-compatible endpoint.
  `provider/model` strings pass through unchanged; model-swap-by-one-string confirmed.
- ⚠️ **Flue is `1.0-beta`** (`@flue/runtime@1.0.0-beta.5`). **Pin exact versions** until stable.
  Correct import is `@flue/runtime`, not `@flue/core`.

**Still open:**
- **Self-host vs SaaS posture** — single-tenant docker-compose first; multi-tenant later.
- **Identity across platforms** — is a Telegram user the same person as a Slack user? (v1: no.)
- **MCP server distribution** — bundle a starter set (web search, fs, GitHub) vs BYO only.
- **Cost guardrails** — per-channel token budgets, especially for ambient mode.
```
