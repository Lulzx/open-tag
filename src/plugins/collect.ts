/**
 * Selectors over the plugin manifest, so each consumption point stays small.
 *
 * Resolution order is manifest order (see index.ts): the first command whose
 * `parse` matches wins, help/settings lines compose in manifest order, etc.
 *
 * Imported by BOTH processes; functions touch `plugins` lazily (at call time),
 * so the import cycle with the built-in plugins resolves cleanly.
 */
import type { ToolDefinition } from '@flue/runtime';
import { plugins } from './index.ts';
import type { CommandContext, CommandSpec, MessageHooks, ToolContext } from './types.ts';

export function allCommands(): CommandSpec[] {
  return plugins.flatMap((p) => p.commands ?? []);
}

export function messageHooks(): MessageHooks[] {
  return plugins.flatMap((p) => (p.hooks ? [p.hooks] : []));
}

export async function collectTools(ctx: ToolContext): Promise<ToolDefinition[]> {
  const groups = await Promise.all(plugins.map((p) => p.tools?.(ctx) ?? []));
  return groups.flat();
}

/** Static tool names for the RBAC catalog (the `tools` admin command). */
export function toolCatalog(): string[] {
  return plugins.flatMap((p) => p.toolNames ?? []);
}

/** Compose the `help` output: header + each plugin's help line, in order. */
export function helpText(): string {
  const lines = plugins.flatMap((p) => p.commands?.flatMap((c) => (c.help ? [c.help] : [])) ?? []);
  return ['*open-tag commands* (mention me, then:)', ...lines].join('\n');
}

/** Each plugin's `settings` line, in manifest order, skipping the silent ones. */
export function describeAll(ctx: CommandContext): string[] {
  return plugins.map((p) => p.describe?.(ctx)).filter((line): line is string => Boolean(line));
}

export function runServerStart(): Promise<unknown> {
  return Promise.all(plugins.map((p) => p.lifecycle?.onServerStart?.()));
}

export function runBotStart(): Promise<unknown> {
  return Promise.all(plugins.map((p) => p.lifecycle?.onBotStart?.()));
}

export function runBotStop(): Promise<unknown> {
  return Promise.allSettled(plugins.map((p) => p.lifecycle?.onBotStop?.()));
}
