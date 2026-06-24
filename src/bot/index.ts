/**
 * open-tag bot entry — the product layer wiring (roadmap step 1).
 *
 *   Telegram message  →  normalized IncomingMessage  (platform adapter)
 *                     →  shared per-channel session   (multiplayer key + lock)
 *                     →  Flue teammate agent          (SDK send + stream)
 *                     →  streamed reply, edited in place (StreamRenderer)
 *
 * This is a separate process from the Flue server (`flue dev`/`dist/server.mjs`),
 * which hosts the agent. Long-poll transports are application-owned infra, so
 * the bot talks to the agent over the Flue SDK at FLUE_BASE_URL.
 */
import { StreamRenderer } from '../core/renderer.ts';
import { sessionIdFor, withChannelLock } from '../core/session.ts';
import { runTeammate } from '../core/teammate-client.ts';
import { TelegramAdapter } from '../platform/telegram.ts';
import type { IncomingMessage } from '../platform/types.ts';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('[open-tag] TELEGRAM_BOT_TOKEN is not set. Get one from @BotFather and add it to .env.');
  process.exit(1);
}

const adapter = new TelegramAdapter(token);

adapter.onMessage(async (msg: IncomingMessage) => {
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
      console.error('[open-tag] turn failed:', err);
      await renderer.fail(err);
    }
  });
});

async function main(): Promise<void> {
  console.log(`[open-tag] connecting to Flue agent at ${process.env.FLUE_BASE_URL ?? 'http://127.0.0.1:3583'}`);
  const shutdown = () => {
    console.log('\n[open-tag] shutting down…');
    void adapter.stop().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await adapter.start(); // runs the long-poll loop until stopped.
}

void main();
