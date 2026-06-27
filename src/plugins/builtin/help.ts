/**
 * The `help` command — composes its output from every plugin's help line.
 */
import { helpText } from '../collect.ts';
import type { Plugin } from '../types.ts';

export const helpPlugin: Plugin = {
  name: 'help',
  commands: [
    {
      name: 'help',
      help: '• `help` — this message',
      parse: (text) =>
        /^help$/i.test(text.trim()) ? { mutating: false, run: () => helpText() } : null,
    },
  ],
};
