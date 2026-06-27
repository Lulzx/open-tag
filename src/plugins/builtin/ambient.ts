/**
 * Ambient mode: the `ambient on|off|status` command, the chime-in gate, and the
 * `settings` line — one plugin owning the per-channel ambient flag and the
 * rate limiter.
 *
 * The gate keeps triage + budget in a single hook so the short-circuit order
 * (flag → triage → rate limit) and budget consumption match the prior runtime.
 */
import { RateLimiter, shouldChimeIn } from '../../core/ambient.ts';
import { ChannelConfigStore } from '../../core/channel-config.ts';
import type { ParsedCommand, Plugin } from '../types.ts';

const config = new ChannelConfigStore();
// Keep ambient mode quiet: at most a few self-initiated turns per channel/hour.
const limiter = new RateLimiter(4, 60 * 60 * 1000);

function parse(text: string): ParsedCommand | null {
  const m = /^ambient\s+(on|off|status)$/i.exec(text.trim());
  if (!m) return null;
  const arg = m[1].toLowerCase();
  return {
    mutating: arg !== 'status',
    run: (ctx) => {
      if (arg === 'status') {
        return `Ambient mode is ${config.get(ctx.sessionId).ambient ? 'on' : 'off'} for this channel.`;
      }
      const on = arg === 'on';
      config.setAmbient(ctx.sessionId, on);
      return on
        ? "Ambient mode enabled — I'll chime in when I think I can help."
        : "Ambient mode disabled — I'll only respond when @mentioned.";
    },
  };
}

export const ambientPlugin: Plugin = {
  name: 'ambient',
  commands: [
    {
      name: 'ambient',
      help: '• `ambient on|off|status` — let me chime in on messages I’m not tagged in',
      parse,
    },
  ],
  hooks: {
    shouldChimeIn: (ctx) =>
      config.get(ctx.sessionId).ambient &&
      shouldChimeIn(ctx.msg.text) &&
      limiter.allow(ctx.sessionId),
  },
  describe: (ctx) => `• ambient: ${config.get(ctx.sessionId).ambient ? 'on' : 'off'}`,
};
