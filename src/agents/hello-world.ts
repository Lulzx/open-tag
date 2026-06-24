/**
 * Spike: hello-world Flue agent routed through Vercel AI Gateway.
 *
 * MODEL SWAP IS ONE STRING — change MODEL_ID below (or set the env var
 * OPEN_TAG_MODEL) to switch between any provider/model the gateway supports:
 *
 *   'anthropic/claude-sonnet-4-6'    <- default
 *   'openai/gpt-4o'
 *   'google/gemini-2.0-flash'
 *
 * The model string is the ONLY thing that changes between providers.
 */
import { defineAgent } from '@flue/runtime';

const MODEL_ID = process.env.OPEN_TAG_MODEL ?? 'anthropic/claude-sonnet-4-6';

export default defineAgent(() => ({
  model: MODEL_ID,
  instructions: [
    'You are open-tag, a team AI teammate.',
    'Introduce yourself concisely and confirm which model you are running on.',
  ].join(' '),
}));
