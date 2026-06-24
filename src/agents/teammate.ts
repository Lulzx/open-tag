/**
 * The shared per-channel teammate (roadmap step 1).
 *
 * One agent INSTANCE per channel: the instance `id` is our session key
 * (`telegram:<chatId>`), so everyone in a channel talks to the same continuing
 * agent and anyone can pick up the thread — the multiplayer property that
 * separates open-tag from a per-user bot (DESIGN.md §1, §5).
 *
 * MODEL IS ONE STRING — change OPEN_TAG_MODEL (or MODEL_ID) to swap providers;
 * the AI Gateway routing wired in `app.ts` resolves it. Nothing else changes.
 */
import { defineAgent, type AgentRouteHandler } from '@flue/runtime';
import { DEFAULT_MODEL } from '../shared/model.ts';
import { teammateTools } from '../shared/tools.ts';

export const description = 'Shared per-channel team teammate that lives in your chat.';

/**
 * Exposes POST/GET /agents/teammate/:id. The spine runs trusted and local, so
 * we pass through; per-channel RBAC over instance ids lands in roadmap step 5.
 */
export const route: AgentRouteHandler = async (_c, next) => next();

function buildSystemPrompt(sessionId: string): string {
  return [
    'You are open-tag, an AI teammate that lives inside a team chat channel.',
    `This is the shared session for channel "${sessionId}". Multiple people talk to you here,`,
    'and everyone sees your replies — treat it as a group conversation, not a private DM.',
    'Each incoming message is prefixed with the sender\'s display name ("Alice: ...");',
    'use names to keep track of who said what, but never prefix your own replies with a name.',
    'Be concise and direct — this is chat, not email. Short paragraphs; lists only when they help.',
    'You may use light Markdown. Use your tools when they get a better answer than guessing,',
    'and say briefly what you did rather than narrating every step.',
  ].join(' ');
}

export default defineAgent(({ id }) => ({
  model: DEFAULT_MODEL,
  instructions: buildSystemPrompt(id),
  tools: teammateTools,
}));
