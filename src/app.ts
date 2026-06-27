/**
 * Flue app entry point — provider wiring (the model seam, DESIGN.md §4.3).
 *
 * One place, before any agent runs, decides how `provider/model` strings reach
 * a real endpoint. open-tag is model-agnostic: the same agent code runs on any
 * of these by changing one string (OPEN_TAG_MODEL).
 *
 *   ollama/<model>     → Ollama Cloud (OpenAI-compatible)         [default]
 *   anthropic/<model>  → Vercel AI Gateway (when AI_GATEWAY_API_KEY set)
 *   openai/<model>     → Vercel AI Gateway (when AI_GATEWAY_API_KEY set)
 *
 * Add a provider = one `registerProvider` call here. Nothing in the product or
 * platform layers ever touches a provider.
 */
import { registerProvider } from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { runServerStart } from './plugins/collect.ts';

const ollamaApiKey = process.env.OLLAMA_API_KEY;
const gatewayApiKey = process.env.AI_GATEWAY_API_KEY;
const gatewayBaseUrl = process.env.AI_GATEWAY_BASE_URL ?? 'https://ai-gateway.vercel.sh/v1';

// --- Ollama Cloud (default) -------------------------------------------------
// Hosted Ollama models via its OpenAI-compatible endpoint. `ollama` is not a
// catalog provider, so we declare the wire protocol + base URL from scratch.
// Model specifiers look like `ollama/gpt-oss:120b` (the colon is part of the
// model id, not a provider separator). Keys: https://ollama.com/settings/keys
if (ollamaApiKey) {
  registerProvider('ollama', {
    api: 'openai-completions',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'https://ollama.com/v1',
    apiKey: ollamaApiKey,
  });
}

// --- Vercel AI Gateway (optional) ------------------------------------------
// Route the catalog `anthropic`/`openai` providers through the gateway: one
// key, every provider, with routing + fallback. Overriding a catalog provider
// id preserves Pi's model metadata (cost, context window, wire protocol) and
// only swaps the endpoint + key. Change AI_GATEWAY_BASE_URL to use a different
// gateway (OpenRouter, a local proxy, …) with zero code changes.
if (gatewayApiKey) {
  registerProvider('anthropic', { baseUrl: gatewayBaseUrl, apiKey: gatewayApiKey });
  registerProvider('openai', { baseUrl: gatewayBaseUrl, apiKey: gatewayApiKey });
}

if (!ollamaApiKey && !gatewayApiKey) {
  console.warn(
    '[open-tag] No model provider key set. Set OLLAMA_API_KEY (Ollama Cloud) ' +
      'or AI_GATEWAY_API_KEY (Vercel AI Gateway) in .env — requests will fail at auth otherwise.',
  );
}

// Server-side plugin startup, e.g. durable self-scheduling: the schedule plugin
// loads persisted tasks and re-arms their timers, then fires them into the
// channel session via dispatch() when due (roadmap step 3).
void runServerStart().catch((err) => console.error('[open-tag] server start hook failed:', err));

// Hono app wired to Flue's routing layer (agents, channels, workflows).
const app = new Hono();
app.route('/', flue());

export default app;
