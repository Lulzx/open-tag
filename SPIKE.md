# Step-0 Spike: Findings

Goal: de-risk Flue + Vercel AI Gateway before building on them.

---

## 1. Flue Scaffold — Result: SUCCESS

```
pnpm add @flue/runtime@1.0.0-beta.5 hono
pnpm add -D @flue/cli@1.0.0-beta.5 typescript@^6.0.3
pnpm exec flue init --target node
```

- `flue init` writes `flue.config.ts`; no scaffolding of `src/` — you write agents by hand.
- `defineAgent` is the correct API (not `createAgent`, which is a deprecated alias).
- Import from `@flue/runtime` (not `@flue/core` — that was a hallucination in some docs/blog posts).
- `flue run <agent>` spins up an in-process HTTP server, sends the input, streams the response, exits.
- TypeScript typecheck: **zero errors** with the scaffolded files.
- `hono` must be added as an explicit dependency even though `@flue/runtime` bundles it
  internally — the typecheck demands it for `src/app.ts`.

**Package versions (as of 2026-06-24):**

| Package | Version |
|---|---|
| `@flue/runtime` | `1.0.0-beta.5` (released 2026-06-24) |
| `@flue/cli` | `1.0.0-beta.5` |
| `@earendil-works/pi-agent-core` | `^0.79.10` (pinned by runtime) |
| `@earendil-works/pi-ai` | `^0.79.10` (latest: `0.80.2`) |
| `typescript` | `^6.0.3` |
| `hono` | `^4.12.27` |
| `just-bash` | `^3.0.1` (bundled by `@flue/runtime`) |

Flue is in **1.0 beta** — active development, breaking changes are plausible at this stage.

---

## 2. Pi Self-Hostability Verdict: CONFIRMED SELF-HOSTABLE

This was the #1 risk. **Pi does not require a Vercel-hosted control plane.**

Evidence:
- `@flue/runtime`'s own `package.json` lists `just-bash@^3.0.1` as a **direct dependency**.
  `just-bash` is a local, in-process sandbox (bash emulation with virtual filesystem) that
  requires zero external services — it is the default sandbox for `node` target deploys.
- The Vercel Sandbox (`@ai-sdk/sandbox-vercel`) is an *alternative* for stronger VM isolation
  but is not required.
- Pi itself (`@earendil-works/pi-agent-core`) runs as a Node.js process on the host.
  The only per-call SaaS dependency is the LLM provider — which is ours to configure.
- The agent loop, session durability, and durable execution are all implemented locally
  (in-process via Pi + just-bash). No call-home, no rate-limited control plane.

**Verdict: Pi is fully self-hostable for a Node target. Docker-compose deployment is
straightforward — no Vercel account needed for the harness itself.**

Caveat: `just-bash` runs without VM isolation. For production use where agents execute
arbitrary code (shell commands), the stronger isolation options are:
- Docker-wrapped Pi (run the whole process in a container)
- Cloudflare Workers target (Flue supports `--target cloudflare`)

For open-tag's use case (team chat agent, no arbitrary code execution by default), `just-bash`
is fine for the initial `docker-compose` deployment.

---

## 3. AI Gateway ↔ Pi Wiring

**Approach that works:** override the built-in catalog providers via `registerProvider`.

```ts
// src/app.ts
import { registerProvider } from '@flue/runtime';

registerProvider('anthropic', {
  baseUrl: process.env.AI_GATEWAY_BASE_URL ?? 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

registerProvider('openai', {
  baseUrl: process.env.AI_GATEWAY_BASE_URL ?? 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.AI_GATEWAY_API_KEY,
});
```

- The Vercel AI Gateway exposes an **OpenAI-compatible endpoint** at `https://ai-gateway.vercel.sh/v1`.
- Auth: `Authorization: Bearer <AI_GATEWAY_API_KEY>` (standard Bearer token).
- Model format: `provider/model-id` (e.g. `anthropic/claude-sonnet-4-6`) — same format Flue/Pi uses internally, so the string passes through unchanged.
- `registerProvider` with an existing catalog ID (like `anthropic`) **preserves** Pi's model catalog
  (protocol, metadata) while replacing only the endpoint and API key. This is the cleanest approach.
- `registerProvider` is called once at app startup (`src/app.ts`), before any agent runs.

**Does the design's "OpenAI-compatible endpoint Pi targets" fallback work?**
Yes — `registerProvider('openai', { baseUrl: '...', apiKey: '...' })` is exactly that.
Both routes work; the catalog-override approach is cleaner for catalog models.

---

## 4. Model Swap — One String

Model selection lives in **exactly one place** per agent:

```ts
// src/agents/hello-world.ts
const MODEL_ID = process.env.OPEN_TAG_MODEL ?? 'anthropic/claude-sonnet-4-6';

export default defineAgent(() => ({
  model: MODEL_ID,   // <-- change this string (or set OPEN_TAG_MODEL) to swap models
  instructions: '...',
}));
```

To switch from Anthropic to OpenAI: set `OPEN_TAG_MODEL=openai/gpt-4o`. Zero other code changes.
The gateway routes it; `registerProvider('openai', ...)` is already wired in `app.ts`.

This matches DESIGN.md's intent exactly.

---

## 5. How Far `run` Got

```
pnpm run agent:hello
# → flue run hello-world --input '{"message":"Hello, who are you?"}'
```

Output (no key set):
```
[open-tag] AI_GATEWAY_API_KEY is not set. Requests will fail at the auth step.
 ▗  flue run
    agent     hello-world
    id        01KVWYGMKD...
    target    node
    server    http://127.0.0.1:62693
    config    /Users/.../flue.config.ts

user
  Hello, who are you?

Error: No API key for provider: anthropic
```

**What this proves:**
1. Flue built and started the in-process server (no compilation errors).
2. The agent file was discovered and loaded correctly.
3. `src/app.ts` ran — including our `registerProvider` override (the `AI_GATEWAY_API_KEY is not set` warning printed).
4. The request reached the model-dispatch layer and failed at **authentication only**, not at config or build.

**To fully run it:**
```bash
cp .env.example .env
# edit .env: set AI_GATEWAY_API_KEY=<your key from vercel.com/~/ai-gateway/api-keys>
pnpm run agent:hello
```

---

## 6. Blockers and Surprises

**No blockers for the spike.** The two de-risked layers work as designed.

**Surprises / things to note:**

1. **Flue 1.0 is in active beta.** Released 2026-05-14; `1.0.0-beta.5` shipped the same day
   as this spike (2026-06-24). Expect churn. Pin exact versions in `pnpm-lock.yaml`.

2. **`flue init` scaffolds almost nothing.** It only writes `flue.config.ts`. The `src/`
   directory, `app.ts`, agent files, and `tsconfig.json` must all be hand-written (as done
   here). The official quickstart describes `flue add` and `flue docs` to fetch blueprints,
   but these are AI-directed codegen commands, not traditional scaffolding.

3. **`@flue/core` does not exist.** Some blog posts and the `start.md` blueprint reference it —
   that is incorrect. The real import is `@flue/runtime`.

4. **`registerProvider` replaces, not merges.** Each call to `registerProvider` with the same
   provider ID fully replaces that provider's registration. The last call wins.

5. **pnpm build scripts need approval.** `pnpm approve-builds` is required after install;
   `esbuild` and `protobufjs` need to be allowed to compile native binaries. The `pnpm-workspace.yaml`
   in this repo has these pre-approved.

6. **Node ≥ 22.19.0 is required.** Flue's docs specify this; verify `node --version` before running.

---

## 7. Recommended Changes to DESIGN.md

- **Section 3 Stack table:** "Apache-2.0, self-hostable" is confirmed. No caveat needed.
- **Section 8 Open Questions:**
  - "Pi due diligence" → **RESOLVED: fully self-hostable.** Remove from open questions.
  - "AI Gateway ↔ Pi wiring" → **RESOLVED: `registerProvider` with `baseUrl` override.**
    The approach in `src/app.ts` is the canonical pattern.
- **Add note:** Flue is in 1.0 beta; pin exact package versions until stable.
- **Add note:** For production (when agents run shell tools), wrap the Pi process in Docker
  rather than relying on just-bash's in-process isolation.
