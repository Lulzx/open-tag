/**
 * `pnpm dev` — run both halves of open-tag locally:
 *   1. the Flue agent server (`flue dev`, port 3583), which hosts the teammate
 *   2. the Telegram bot, which long-polls and talks to that server over the SDK
 *
 * They are separate processes by design (long-poll is application-owned infra,
 * not a Flue channel). This runner just supervises both and forwards signals.
 */
import { spawn } from 'node:child_process';

const procs = [];
let shuttingDown = false;

function run(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] ${name} exited (${signal ?? code}); shutting down.`);
    shutdown(code ?? 1);
  });
  procs.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of procs) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Start the agent server first.
run('server', 'pnpm', ['run', 'dev:server']);

// Give the server a moment to bind before the bot starts polling.
setTimeout(() => {
  if (!shuttingDown) run('bot', 'pnpm', ['run', 'dev:bot']);
}, 2500);
