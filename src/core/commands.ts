/**
 * Lightweight in-chat control commands (roadmap step 4; expands in step 5).
 *
 * When the bot is addressed with a recognized command (e.g. "ambient on") the
 * runtime handles it locally instead of sending it to the agent. This is the
 * minimal admin surface for per-channel settings; permissions and model-picker
 * commands build on it in step 5.
 */

export type Command = { kind: 'ambient'; arg: 'on' | 'off' | 'status' };

/** Parse a control command from already-mention-stripped text, or null. */
export function parseCommand(text: string): Command | null {
  const ambient = /^ambient\s+(on|off|status)$/i.exec(text.trim());
  if (ambient) return { kind: 'ambient', arg: ambient[1].toLowerCase() as 'on' | 'off' | 'status' };
  return null;
}
