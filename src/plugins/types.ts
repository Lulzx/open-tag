/**
 * The plugin vocabulary — one `Plugin` interface, consumed in two processes.
 *
 * A plugin declares its contributions once; each process reads only its slice:
 *   • the BOT reads `commands`, `hooks`, and the bot lifecycle hooks;
 *   • the SERVER reads `tools`, `toolNames`, and `onServerStart`.
 *
 * So a plugin module MUST be importable in both processes: it may not import a
 * platform SDK (grammy/discord.js) at the top level, and its tool factories must
 * be side-effect-free (importing them does nothing; only the agent runs them).
 *
 * Everything here is plain interfaces and string unions — no classes with
 * parameter properties, no enums, no decorators (the bot runs raw .ts in
 * strip-only mode).
 */
import type { ToolDefinition } from '@flue/runtime';
import type { IncomingMessage, PlatformAdapter } from '../platform/types.ts';

// ─── Commands (bot process) ─────────────────────────────────────────────────

export interface CommandContext {
  sessionId: string;
  msg: IncomingMessage;
  adapter: PlatformAdapter;
}

/** The result of a successful parse: how to run it, and whether it's admin-gated. */
export interface ParsedCommand {
  /** True for commands that change channel settings (gated by admin auth). */
  mutating: boolean;
  run(ctx: CommandContext): string | Promise<string>;
}

export interface CommandSpec {
  name: string;
  /** One HELP_TEXT bullet (composed into the `help` output in manifest order). */
  help?: string;
  /** Parse already-mention-stripped text into a runnable command, or null. */
  parse(text: string): ParsedCommand | null;
}

// ─── Message hooks / middleware (bot process) ───────────────────────────────

export interface MessageHookContext {
  sessionId: string;
  msg: IncomingMessage;
  adapter: PlatformAdapter;
  /** Whether the bot was addressed (=== msg.mentionsBot). */
  addressed: boolean;
  /** Whether this channel is already a tracked session (gates recall ingestion). */
  registered: boolean;
}

export interface MessageHooks {
  /** Observe every inbound message (e.g. ingest into recall). Fire-and-forget. */
  onMessage?(ctx: MessageHookContext): void | Promise<void>;
  /** Ambient gate: ALL registered hooks must return true to chime in. */
  shouldChimeIn?(ctx: MessageHookContext): boolean | Promise<boolean>;
  /** Run just before an agent turn is submitted (e.g. the 👀 ack). */
  onBeforeSubmit?(ctx: MessageHookContext): void | Promise<void>;
}

// ─── Lifecycle (both processes; each reads its own slice) ───────────────────

export interface LifecycleHooks {
  /** Server (app.ts) startup, e.g. re-arm the scheduler. */
  onServerStart?(): void | Promise<void>;
  /** Bot (bot/index.ts) startup, after adapters are connected. */
  onBotStart?(): void | Promise<void>;
  /** Bot shutdown. */
  onBotStop?(): void | Promise<void>;
}

// ─── Tools (server process) ─────────────────────────────────────────────────

export interface ToolContext {
  sessionId: string;
  /** MCP server names the channel allowed (default deny). */
  mcpAllow: string[];
}

export type ToolProvider = (ctx: ToolContext) => ToolDefinition[] | Promise<ToolDefinition[]>;

// ─── The unit ───────────────────────────────────────────────────────────────

export interface Plugin {
  name: string;
  commands?: CommandSpec[]; // bot
  hooks?: MessageHooks; // bot
  lifecycle?: LifecycleHooks; // both (each process reads its slice)
  tools?: ToolProvider; // server
  /** Static tool names for the RBAC catalog (the `tools` admin command). */
  toolNames?: string[]; // server
  /** One line for the `settings` command (e.g. "• model: …"), or null. */
  describe?(ctx: CommandContext): string | null;
}
