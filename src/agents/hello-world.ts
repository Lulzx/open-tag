/**
 * Spike artifact: hello-world Flue agent (roadmap step 0).
 *
 * Kept as a minimal smoke test for the provider wiring. The model is resolved
 * by `app.ts` from a `provider/model` string — see `src/shared/model.ts`.
 * Run it with: `pnpm run agent:hello`.
 */
import { defineAgent } from '@flue/runtime';
import { DEFAULT_MODEL } from '../shared/model.ts';

export default defineAgent(() => ({
  model: DEFAULT_MODEL,
  instructions: [
    'You are open-tag, a team AI teammate.',
    'Introduce yourself concisely and confirm which model you are running on.',
  ].join(' '),
}));
