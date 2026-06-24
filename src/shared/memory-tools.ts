/**
 * Per-channel memory tools (roadmap step 4), bound to one channel session.
 *
 * The agent uses these to retain durable facts about its channel so the team
 * stops re-explaining. Remembered facts are injected into the system prompt for
 * this channel (see `agents/teammate.ts`).
 */
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { forget, recall, remember } from '../core/memory.ts';

export function createMemoryTools(sessionId: string) {
  const remember_fact = defineTool({
    name: 'remember_fact',
    description:
      'Save a durable fact, decision, or preference about THIS channel so you do not have to ask again. ' +
      'Keep each fact short and self-contained.',
    input: v.object({
      fact: v.pipe(v.string(), v.minLength(1), v.description('A single concise fact to remember.')),
    }),
    output: v.object({ remembered: v.boolean(), total: v.number() }),
    async run({ input }) {
      const total = remember(sessionId, input.fact);
      return { remembered: true, total };
    },
  });

  const list_facts = defineTool({
    name: 'list_facts',
    description: 'List the durable facts you have remembered about this channel.',
    output: v.object({ facts: v.array(v.string()) }),
    async run() {
      return { facts: recall(sessionId) };
    },
  });

  const forget_fact = defineTool({
    name: 'forget_fact',
    description: 'Forget a remembered fact by its text (exact or partial match).',
    input: v.object({ fact: v.pipe(v.string(), v.minLength(1)) }),
    output: v.object({ forgotten: v.boolean() }),
    async run({ input }) {
      return { forgotten: forget(sessionId, input.fact) };
    },
  });

  return [remember_fact, list_facts, forget_fact];
}
