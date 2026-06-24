<h1 align="center">open-tag</h1>

<p align="center">
  <em>An open-source, model-agnostic &amp; platform-agnostic alternative to
  <a href="https://www.anthropic.com/news/introducing-claude-tag">Anthropic's Claude Tag</a> —
  a persistent AI teammate that lives in your team chat.</em>
</p>

<p align="center">
  <a href="#status"><img alt="status" src="https://img.shields.io/badge/status-early%20wip-orange"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-Node%2022.19%2B-3178c6">
</p>

---

## Why

Claude Tag is a great idea wrapped in two constraints: it's **Slack-only** and **Opus-only**.
open-tag keeps the idea and drops both constraints:

- **Platform-agnostic** — Telegram and Discord today, Slack and anything with a bot API next.
- **Model-agnostic** — Ollama Cloud (default), Anthropic, OpenAI, or any provider, swappable with a single config string.
- **Open source & self-hostable** — Apache-2.0, runs on your own infra with just an LLM API key.

It's not a chatbot. It's the five things that make Claude Tag feel like a teammate:

1. **One shared agent per channel** (multiplayer) — everyone sees the same agent working; anyone continues the thread.
2. **Ambient / proactive mode** — it decides on its own when to jump in, flag things, and chase forgotten threads.
3. **Long-running async + self-scheduling** — runs a task over hours or days and schedules its own follow-ups.
4. **Contextual memory** — learns from channel history so you stop re-explaining.
5. **Per-channel permissioned connectors** — admins scope which tools, data, and codebases each channel can touch.

## How

open-tag is deliberately **not** an agent framework. It's a thin **product layer** on two
open building blocks, so we build only what's actually differentiated:

```
   Telegram / Discord / Slack channels        ← platform seam (we own; grammY + discord.js)
                  │
   open-tag product layer                      ← what we build:
   shared per-channel sessions · ambient          multiplayer state, ambient triage,
   mode · per-channel permission policy           per-channel policy
                  │
   Flue + Pi harness  (Apache-2.0)             ← adopt: agent loop, subagents, sandboxes,
                  │                                durable execution
   Ollama Cloud / Vercel AI Gateway            ← adopt: model seam — one string picks the
                                                  provider; gateway adds routing + fallback
```

| Layer | Tech | Build / adopt |
|---|---|---|
| Agent core | [Flue](https://flueframework.com/) + Pi harness | adopt |
| Model seam | [Ollama Cloud](https://ollama.com/) (default) · [Vercel AI Gateway](https://vercel.com/ai-gateway/models) | adopt |
| Platform adapters | [grammY](https://grammy.dev/) (Telegram) · [discord.js](https://discord.js.org/) (Discord) | build |
| Connectors | [MCP](https://modelcontextprotocol.io/) servers as Flue tools | adopt |
| State / memory | Postgres + pgvector | build (schema) |
| Runtime | Node 22.19+, TypeScript, pnpm | — |

See **[DESIGN.md](./DESIGN.md)** for the full architecture and **[SPIKE.md](./SPIKE.md)** for
the de-risking spike that validated the stack (Pi is fully self-hostable; AI Gateway wiring
works; model-swap-by-one-string confirmed).

## Status

**All five roadmap steps land.** `@mention` (or DM) the bot → it joins the shared per-channel
session → the Flue teammate agent runs (tools, self-scheduling, memory) → the reply streams
back, edited in place. Works on **Telegram and Discord** through one normalized adapter seam.
Models default to **Ollama Cloud** and swap with one string. Per-channel ambient mode, model,
and tool permissions are set with in-chat admin commands. Optional **Postgres + pgvector**
adds semantic recall over channel history and facts (`recall_context`). Admin commands default to the platform's own roles
(Telegram chat admins, Discord permissions). **MCP connectors** plug in as tools, opt-in per
channel (`@bot mcp allow <server>`).

- [x] **Step 0** — spike: Flue + AI Gateway, validate self-hostability
- [x] **Step 1** — Telegram channel → shared session → agent → streamed reply
- [x] **Step 2** — second platform (Discord) on the same normalized adapter seam
- [x] **Step 3** — durable self-scheduling: the agent can schedule follow-ups for itself
- [x] **Step 4** — ambient mode (opt-in, triaged, rate-limited) + per-channel memory
- [x] **Step 5** — per-channel tool RBAC, model-picker, and admin commands

> Step 2 proved the seam: adding Discord was one new adapter (`src/platform/discord.ts`)
> plus the launcher's env selection — the product layer did not change. A new platform is one file.
>
> Step 3 made the agent proactive. Each channel session is mirrored to the channel by a
> persistent event tail (`SessionMirror`), so output isn't tied to a request/response — a
> durable `schedule_task` can fire hours later and the reply still lands in the channel.
>
> Step 4 lets it watch and remember. Ambient mode is off until a channel runs `@bot ambient on`;
> then a conservative, rate-limited triage decides when to chime in on messages it wasn't
> addressed in. `remember_fact` keeps durable per-channel facts (injected into the prompt) on
> top of the rolling memory Flue's continuing session already provides.
>
> Step 5 puts channels in control. `@bot help` lists the admin commands: `model <provider/model>`
> picks the channel's model, `tools deny <name>` enforces per-channel RBAC (denied tools are
> filtered out before the model ever sees them), and `OPEN_TAG_ADMINS` gates who may change settings.

## Quick start

> Requires Node 22.19+, [pnpm](https://pnpm.io/), a Telegram bot token from
> [@BotFather](https://t.me/BotFather), and an [Ollama Cloud](https://ollama.com/settings/keys)
> API key (or a [Vercel AI Gateway](https://vercel.com/ai-gateway/models) key).

```bash
git clone https://github.com/Lulzx/open-tag.git
cd open-tag
pnpm install
cp .env.example .env          # add OLLAMA_API_KEY + TELEGRAM_BOT_TOKEN and/or DISCORD_BOT_TOKEN
pnpm dev                      # runs the Flue agent server + the bot (every platform with a token)
```

Then `@mention` your bot in a Telegram or Discord channel (or DM it) and it replies in the
shared channel session.

`pnpm dev` runs two processes — start them separately if you prefer:

```bash
pnpm dev:server   # the Flue agent server (hosts the teammate agent)
pnpm dev:bot       # the Telegram bot (long-polls; talks to the server over the Flue SDK)
pnpm run agent:hello   # optional: smoke-test the model wiring with the step-0 agent
```

Swap the model by changing a single value in `.env` — the prefix picks the provider:

```bash
OPEN_TAG_MODEL=ollama/gpt-oss:120b           # Ollama Cloud (default)
OPEN_TAG_MODEL=ollama/qwen3-coder:480b       # any Ollama Cloud model
OPEN_TAG_MODEL=anthropic/claude-sonnet-4-6   # via Vercel AI Gateway (needs AI_GATEWAY_API_KEY)
```

## Contributing

Early and moving fast — issues and ideas welcome. Start with [DESIGN.md](./DESIGN.md) to
understand the architecture before opening a PR.

## License

[Apache-2.0](./LICENSE).
