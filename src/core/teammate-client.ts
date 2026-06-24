/**
 * Drives the shared per-channel Flue agent and surfaces its output as a live
 * text stream (DESIGN.md §4.3).
 *
 * We do NOT write a model gateway or an agent loop — we send a prompt to a
 * persistent agent instance (instance id = the per-channel session key) and
 * stream its events back via the Flue SDK. The model is resolved by the
 * AI Gateway from a `provider/model` string inside the agent definition.
 */
import { createFlueClient } from '@flue/sdk';

const AGENT_NAME = 'teammate';

const baseUrl = process.env.FLUE_BASE_URL ?? 'http://127.0.0.1:3583';
const client = createFlueClient({
  baseUrl,
  ...(process.env.FLUE_TOKEN ? { token: process.env.FLUE_TOKEN } : {}),
});

export interface RunTeammateArgs {
  /** Shared per-channel session id — the Flue agent instance id. */
  sessionId: string;
  /** Prompt text (we prefix the speaker's name for multiplayer awareness). */
  message: string;
  /** Called with the full accumulated assistant text as it grows. */
  onDelta?: (fullText: string) => void;
  /** Called when the agent starts a tool call (a "working…" affordance). */
  onToolStart?: (toolName: string) => void;
}

/**
 * Send one prompt to the channel's agent instance and stream the reply.
 * Resolves with the final assistant text once the instance goes idle.
 */
export async function runTeammate(args: RunTeammateArgs): Promise<string> {
  const { sessionId, message, onDelta, onToolStart } = args;

  // `send` enters the per-instance durable queue and returns the stream offset
  // for exactly this submission's events.
  const { offset } = await client.agents.send(AGENT_NAME, sessionId, { message });

  let full = '';
  for await (const event of client.agents.stream(AGENT_NAME, sessionId, { offset, live: true })) {
    switch (event.type) {
      case 'text_delta':
        full += event.text;
        onDelta?.(full);
        break;
      case 'tool_start':
        onToolStart?.(event.toolName);
        break;
      case 'submission_settled':
        if (event.outcome === 'failed') {
          throw new Error(event.error?.message ?? 'agent submission failed');
        }
        break;
      case 'idle':
        return full;
    }
  }
  return full;
}
