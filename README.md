<h1 align="center">open-tag</h1>

<p align="center">
  <em>An open-source, model-agnostic &amp; platform-agnostic alternative to
  <a href="https://www.anthropic.com/news/introducing-claude-tag">Anthropic's Claude Tag</a> —
  a persistent AI teammate that lives in your team chat.</em>
</p>

<p align="center">
  <a href="#status"><img alt="status" src="https://img.shields.io/badge/status-early%20wip-orange"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-Node%2020%2B-3178c6">
</p>

---

## Why

Claude Tag is a great idea wrapped in two constraints: it's **Slack-only** and **Opus-only**.
open-tag keeps the idea and drops both constraints:

- **Platform-agnostic** — Telegram first, then Discord, Slack, and anything with a bot API.
- **Model-agnostic** — Anthropic, OpenAI, Gemini, or local models, swappable with a single config string.
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
   Telegram / Discord / Slack channels        ← platform seam (we own; grammY for Telegram)
                  │
   open-tag product layer                      ← what we build:
   shared per-channel sessions · ambient          multiplayer state, ambient triage,
   mode · per-channel permission policy           per-channel policy
                  │
   Flue + Pi harness  (Apache-2.0)             ← adopt: agent loop, subagents, sandboxes,
                  │                                durable execution
   Vercel AI Gateway                           ← adopt: one key, every provider, fallback
```

| Layer | Tech | Build / adopt |
|---|---|---|
| Agent core | [Flue](https://flueframework.com/) + Pi harness | adopt |
| Model gateway | [Vercel AI Gateway](https://vercel.com/ai-gateway/models) | adopt |
| Telegram channel | [grammY](https://grammy.dev/) | build |
| Connectors | [MCP](https://modelcontextprotocol.io/) servers as Flue tools | adopt |
| State / memory | Postgres + pgvector | build (schema) |
| Runtime | Node 20+, TypeScript, pnpm | — |

See **[DESIGN.md](./DESIGN.md)** for the full architecture and **[SPIKE.md](./SPIKE.md)** for
the de-risking spike that validated the stack (Pi is fully self-hostable; AI Gateway wiring
works; model-swap-by-one-string confirmed).

## Status

**Early WIP.** Roadmap step 0 (de-risking spike) is done — a hello-world Flue agent runs
against the Vercel AI Gateway. Next up is step 1: the Telegram vertical (`@bot` mention →
shared per-channel session → agent → streamed reply).

- [x] **Step 0** — spike: Flue + AI Gateway, validate self-hostability
- [ ] **Step 1** — Telegram channel → shared session → agent → streamed reply
- [ ] **Step 2** — second platform (proves the abstraction)
- [ ] **Step 3** — durable tasks + self-scheduling
- [ ] **Step 4** — ambient mode + per-channel memory
- [ ] **Step 5** — permissions, admin, model-picker

## Quick start

> Requires Node 20+, [pnpm](https://pnpm.io/), and a [Vercel AI Gateway](https://vercel.com/ai-gateway/models) API key.

```bash
git clone https://github.com/Lulzx/open-tag.git
cd open-tag
pnpm install
cp .env.example .env          # add your AI_GATEWAY_API_KEY
pnpm run agent:hello          # runs the hello-world Flue agent
```

Swap the model by changing a single value in `.env`:

```bash
OPEN_TAG_MODEL=anthropic/claude-sonnet-4-6   # or openai/gpt-4o, google/gemini-..., etc.
```

## Contributing

Early and moving fast — issues and ideas welcome. Start with [DESIGN.md](./DESIGN.md) to
understand the architecture before opening a PR.

## License

[Apache-2.0](./LICENSE).
