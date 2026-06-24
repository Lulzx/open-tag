/**
 * The Flue SDK client the bot uses to drive the per-channel agent (DESIGN.md §4.3).
 *
 * We don't write a model gateway or agent loop — we submit prompts to a
 * persistent agent instance (instance id = the per-channel session key) and
 * tail its event stream. The model is resolved server-side by the AI Gateway /
 * Ollama Cloud from a `provider/model` string in the agent definition.
 *
 * Streaming/rendering lives in `SessionMirror`; this module only owns the client.
 */
import { createFlueClient } from '@flue/sdk';
import { TEAMMATE_AGENT } from '../shared/constants.ts';

export const AGENT_NAME = TEAMMATE_AGENT;

const baseUrl = process.env.FLUE_BASE_URL ?? 'http://127.0.0.1:3583';

export const teammateClient = createFlueClient({
  baseUrl,
  ...(process.env.FLUE_TOKEN ? { token: process.env.FLUE_TOKEN } : {}),
});
