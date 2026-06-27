/**
 * History ingestion for semantic recall: index every message in an already-
 * tracked channel (no-op unless DATABASE_URL is set). Fire-and-forget.
 */
import { index } from '../../core/recall.ts';
import type { Plugin } from '../types.ts';

export const recallPlugin: Plugin = {
  name: 'recall',
  hooks: {
    onMessage: (ctx) => {
      if (ctx.registered && ctx.msg.text.trim().length >= 12) {
        void index(ctx.sessionId, 'message', `${ctx.msg.userDisplay}: ${ctx.msg.text}`);
      }
    },
  },
};
