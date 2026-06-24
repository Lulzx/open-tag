/**
 * open-tag bot entry — the launcher.
 *
 * Selects platform adapters from the environment and wires each into the same
 * platform-agnostic product layer (`TeammateRuntime`). Adding a platform is one
 * adapter file plus one line here.
 *
 * Separate process from the Flue server (`flue dev` / `dist/server.mjs`), which
 * hosts the agent and the scheduler; the bot reaches it over the Flue SDK at
 * FLUE_BASE_URL and mirrors each channel's session — including proactive output
 * (scheduled tasks) — back to the channel.
 */
import { TeammateRuntime } from '../core/teammate-runtime.ts';
import { DiscordAdapter } from '../platform/discord.ts';
import { TelegramAdapter } from '../platform/telegram.ts';
import type { PlatformAdapter } from '../platform/types.ts';

function configuredAdapters(): PlatformAdapter[] {
  const adapters: PlatformAdapter[] = [];
  if (process.env.TELEGRAM_BOT_TOKEN) adapters.push(new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN));
  if (process.env.DISCORD_BOT_TOKEN) adapters.push(new DiscordAdapter(process.env.DISCORD_BOT_TOKEN));
  return adapters;
}

async function main(): Promise<void> {
  const adapters = configuredAdapters();
  if (adapters.length === 0) {
    console.error(
      '[open-tag] No platform token set. Set TELEGRAM_BOT_TOKEN and/or DISCORD_BOT_TOKEN in .env.',
    );
    process.exit(1);
  }

  console.log(`[open-tag] connecting to Flue agent at ${process.env.FLUE_BASE_URL ?? 'http://127.0.0.1:3583'}`);

  const runtime = new TeammateRuntime(adapters);

  const shutdown = () => {
    console.log('\n[open-tag] shutting down…');
    Promise.allSettled(adapters.map((a) => a.stop())).finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  runtime.attach();
  // start() resolves once each adapter is connected; their sockets keep us alive.
  await Promise.all(adapters.map((a) => a.start()));
  // Re-tail known channels so output produced while the bot was down still renders.
  runtime.resume();
  console.log(`[open-tag] live on: ${adapters.map((a) => a.platform).join(', ')}`);
}

void main();
