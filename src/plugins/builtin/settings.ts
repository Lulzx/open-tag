/**
 * The `settings` (a.k.a. `status`) command — aggregates each plugin's
 * `describe` line into the per-channel settings summary.
 */
import { describeAll } from '../collect.ts';
import type { Plugin } from '../types.ts';

export const settingsPlugin: Plugin = {
  name: 'settings',
  commands: [
    {
      name: 'settings',
      help: '• `settings` — show this channel’s ambient mode, model, and disabled tools',
      parse: (text) =>
        /^(settings|status)$/i.test(text.trim())
          ? {
              mutating: false,
              run: (ctx) => ['Settings for this channel:', ...describeAll(ctx)].join('\n'),
            }
          : null,
    },
  ],
};
