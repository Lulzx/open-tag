/**
 * In-chat control commands (roadmap steps 4–5).
 *
 * When the bot is addressed with a recognized command, the runtime handles it
 * locally instead of sending it to the agent. This is the admin surface for
 * per-channel settings: ambient mode, the model-picker, and tool RBAC.
 * Mutating commands are gated by `isAdmin` in the runtime.
 */

export type Command =
  | { kind: 'help' }
  | { kind: 'settings' }
  | { kind: 'ambient'; arg: 'on' | 'off' | 'status' }
  | { kind: 'model-show' }
  | { kind: 'model-set'; model: string }
  | { kind: 'model-reset' }
  | { kind: 'tools-list' }
  | { kind: 'tools-allow'; name: string }
  | { kind: 'tools-deny'; name: string }
  | { kind: 'tools-reset' };

/** True for commands that change channel settings (admin-gated). */
export function isMutating(command: Command): boolean {
  switch (command.kind) {
    case 'help':
    case 'settings':
    case 'model-show':
    case 'tools-list':
      return false;
    case 'ambient':
      return command.arg !== 'status';
    default:
      return true;
  }
}

/** Parse a control command from already-mention-stripped text, or null. */
export function parseCommand(text: string): Command | null {
  const t = text.trim();

  if (/^help$/i.test(t)) return { kind: 'help' };
  if (/^(settings|status)$/i.test(t)) return { kind: 'settings' };

  const ambient = /^ambient\s+(on|off|status)$/i.exec(t);
  if (ambient) return { kind: 'ambient', arg: ambient[1].toLowerCase() as 'on' | 'off' | 'status' };

  if (/^model$/i.test(t)) return { kind: 'model-show' };
  if (/^model\s+reset$/i.test(t)) return { kind: 'model-reset' };
  const modelSet = /^model\s+(\S+)$/i.exec(t);
  if (modelSet) return { kind: 'model-set', model: modelSet[1] };

  if (/^tools$/i.test(t)) return { kind: 'tools-list' };
  if (/^tools\s+reset$/i.test(t)) return { kind: 'tools-reset' };
  const toolsAllow = /^tools\s+allow\s+(\S+)$/i.exec(t);
  if (toolsAllow) return { kind: 'tools-allow', name: toolsAllow[1] };
  const toolsDeny = /^tools\s+deny\s+(\S+)$/i.exec(t);
  if (toolsDeny) return { kind: 'tools-deny', name: toolsDeny[1] };

  return null;
}

export const HELP_TEXT = [
  '*open-tag commands* (mention me, then:)',
  '• `help` — this message',
  '• `settings` — show this channel’s ambient mode, model, and disabled tools',
  '• `ambient on|off|status` — let me chime in on messages I’m not tagged in',
  '• `model` / `model <provider/model>` / `model reset` — pick this channel’s model',
  '• `tools` / `tools deny <name>` / `tools allow <name>` / `tools reset` — control my tools',
].join('\n');
