/**
 * Quick "👀" acknowledgement on a directly-addressed message, so the channel
 * sees we're on it before the streamed reply starts. Best-effort; addressed
 * messages only (ambient turns never reacted).
 */
import type { Plugin } from '../types.ts';

export const reactAckPlugin: Plugin = {
  name: 'react-ack',
  hooks: {
    onBeforeSubmit: async (ctx) => {
      if (!ctx.addressed) return;
      await ctx.adapter
        .react?.({ channelId: ctx.msg.channelId, messageId: ctx.msg.messageId }, '👀')
        .catch(() => {});
    },
  },
};
