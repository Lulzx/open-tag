/**
 * The model-picker: `model` / `model <provider/model>` / `model reset`.
 * Parse order matters — `reset` before the generic `model <x>`.
 */
import { getPolicy, setModel } from '../../core/policy.ts';
import { DEFAULT_MODEL } from '../../shared/model.ts';
import type { ParsedCommand, Plugin } from '../types.ts';

function parse(text: string): ParsedCommand | null {
  const t = text.trim();
  if (/^model$/i.test(t)) {
    return {
      mutating: false,
      run: (ctx) => `Model: ${getPolicy(ctx.sessionId).model ?? `${DEFAULT_MODEL} (default)`}`,
    };
  }
  if (/^model\s+reset$/i.test(t)) {
    return {
      mutating: true,
      run: (ctx) => {
        setModel(ctx.sessionId, undefined);
        return `Model reset to the default (${DEFAULT_MODEL}). Applies to new turns.`;
      },
    };
  }
  const set = /^model\s+(\S+)$/i.exec(t);
  if (set) {
    const model = set[1];
    return {
      mutating: true,
      run: (ctx) => {
        if (!model.includes('/')) {
          return 'Model must look like `provider/model`, e.g. `ollama/gpt-oss:120b`.';
        }
        setModel(ctx.sessionId, model);
        return `Model set to \`${model}\` for this channel. Applies to new turns.`;
      },
    };
  }
  return null;
}

export const modelPlugin: Plugin = {
  name: 'model',
  commands: [
    {
      name: 'model',
      help: '• `model` / `model <provider/model>` / `model reset` — pick this channel’s model',
      parse,
    },
  ],
  describe: (ctx) => `• model: ${getPolicy(ctx.sessionId).model ?? `${DEFAULT_MODEL} (default)`}`,
};
