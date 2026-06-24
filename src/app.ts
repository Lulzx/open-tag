/**
 * Flue app entry point.
 *
 * Provider wiring happens here — one place, before any agent code runs.
 * We redirect the Anthropic provider through Vercel AI Gateway using its
 * OpenAI-compatible endpoint (base URL: https://ai-gateway.vercel.sh/v1).
 *
 * Why the anthropic catalog provider + gateway baseUrl?
 *   - Pi's catalog already knows the Anthropic wire protocol.
 *   - Overriding baseUrl + apiKey is enough to reroute through the gateway.
 *   - The gateway accepts `provider/model` strings in the model field and
 *     forwards to the upstream provider transparently.
 *
 * Why NOT register a brand-new "vercel-gateway" provider?
 *   - That would require specifying api:'openai-completions' and listing
 *     every model. By overriding the catalog provider we keep model metadata.
 *
 * To switch all traffic to a different gateway (e.g. OpenRouter, a local
 * Ollama): change AI_GATEWAY_BASE_URL. One env var, zero code changes.
 */
import { registerProvider } from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { Hono } from 'hono';

const gatewayBaseUrl = process.env.AI_GATEWAY_BASE_URL ?? 'https://ai-gateway.vercel.sh/v1';
const gatewayApiKey = process.env.AI_GATEWAY_API_KEY;

if (!gatewayApiKey) {
  // Warn loudly at startup so the error message is clear.
  console.warn(
    '[open-tag] AI_GATEWAY_API_KEY is not set. ' +
    'Requests will fail at the auth step. ' +
    'Set it in .env to run the agent.'
  );
}

// Route the built-in 'anthropic' catalog provider through Vercel AI Gateway.
// The gateway exposes an OpenAI-compatible endpoint at /v1, so we point
// the `openai` catalog provider there too — any 'openai/...' model string
// will then resolve through the gateway as well.
registerProvider('anthropic', {
  baseUrl: gatewayBaseUrl,
  apiKey: gatewayApiKey,
});

registerProvider('openai', {
  baseUrl: gatewayBaseUrl,
  apiKey: gatewayApiKey,
});

// Hono app wired to Flue's routing layer.
const app = new Hono();
app.route('/', flue());

export default app;
