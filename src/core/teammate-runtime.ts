/**
 * The product layer, platform-agnostic (DESIGN.md §2).
 *
 *   incoming message  →  shared per-channel session  (multiplayer key + lock)
 *                     →  Flue teammate agent          (SDK send + stream)
 *                     →  reply streamed back, edited in place (StreamRenderer)
 *
 * This is the whole point of the normalized seam: `attachTeammate` knows nothing
 * about Telegram or Discord — it speaks only `PlatformAdapter`. A new platform
 * is a new adapter file; this function does not change. (Roadmap step 2.)
 */
import { StreamRenderer } from './renderer.ts';
import { sessionIdFor, withChannelLock } from './session.ts';
import { runTeammate } from './teammate-client.ts';
import type { PlatformAdapter } from '../platform/types.ts';

export function attachTeammate(adapter: PlatformAdapter): void {
  adapter.onMessage(async (msg) => {
    // Spine: respond only when addressed. Ambient triage on non-mentions is step 4.
    if (!msg.mentionsBot) return;
    if (!msg.text) return;

    const sessionId = sessionIdFor(msg.platform, msg.channelId);

    // Serialize concurrent turns for the SAME channel so they queue on the shared
    // session instead of racing it; different channels still run concurrently.
    await withChannelLock(sessionId, async () => {
      const renderer = new StreamRenderer(adapter, msg.channelId, { replyTo: msg.messageId });
      await renderer.open();
      try {
        await runTeammate({
          sessionId,
          message: `${msg.userDisplay}: ${msg.text}`,
          onDelta: (text) => renderer.push(text),
          onToolStart: (tool) => renderer.setNote(`🔧 ${tool}…`),
        });
        await renderer.finish();
      } catch (err) {
        console.error(`[open-tag] turn failed (${adapter.platform}):`, err);
        await renderer.fail(err);
      }
    });
  });
}
