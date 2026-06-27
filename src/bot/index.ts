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
import { adapterFactories } from '../platform/adapters.ts';
import { selectAdapters } from '../platform/registry.ts';
import { runBotStart, runBotStop } from '../plugins/collect.ts';

async function main(): Promise<void> {
  const adapters = selectAdapters(adapterFactories);
  if (adapters.length === 0) {
    const hints = adapterFactories.map((f) => f.envHint).join(' and/or ');
    console.error(`[open-tag] No platform token set. Set ${hints} in .env.`);
    process.exit(1);
  }

  console.log(`[open-tag] connecting to Flue agent at ${process.env.FLUE_BASE_URL ?? 'http://127.0.0.1:3583'}`);

  const runtime = new TeammateRuntime(adapters);

  const shutdown = () => {
    console.log('\n[open-tag] shutting down…');
    Promise.allSettled([runBotStop(), ...adapters.map((a) => a.stop())]).finally(() =>
      process.exit(0),
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  runtime.attach();
  // start() resolves once each adapter is connected; their sockets keep us alive.
  await Promise.all(adapters.map((a) => a.start()));
  // Re-tail known channels so output produced while the bot was down still renders.
  runtime.resume();
  // Bot-side plugin startup (none built-in today; reserved for plugin-owned setup).
  await runBotStart();
  console.log(`[open-tag] live on: ${adapters.map((a) => a.platform).join(', ')}`);
}

void main();
