/**
 * The product layer, platform-agnostic (DESIGN.md §2).
 *
 *   incoming message  →  addressed?  →  command or agent turn
 *                     →  overheard?  →  ambient triage (opt-in, rate-limited)
 *                     →  Flue teammate agent  →  every turn mirrored to channel
 *
 * `TeammateRuntime` knows nothing about Telegram or Discord — it speaks only
 * `PlatformAdapter`. It is also feature-agnostic: commands, ambient triage,
 * history ingestion and the 👀-ack are all contributed by plugins (see
 * `../plugins`). The runtime just routes messages and owns one `SessionMirror`
 * per channel; the mirror's persistent tail carries proactive output back too.
 */
import { hasAdminAllowlist, inAllowlist } from './admin.ts';
import { ChannelRegistry } from './channel-registry.ts';
import { SessionMirror } from './session-mirror.ts';
import { sessionIdFor } from './session.ts';
import { allCommands, messageHooks } from '../plugins/collect.ts';
import type { CommandContext, MessageHookContext, ParsedCommand } from '../plugins/types.ts';
import type { IncomingMessage, Platform, PlatformAdapter } from '../platform/types.ts';

export class TeammateRuntime {
  private readonly adapters = new Map<Platform, PlatformAdapter>();
  private readonly registry: ChannelRegistry;
  private readonly mirrors = new Map<string, SessionMirror>();

  constructor(adapters: PlatformAdapter[], registry: ChannelRegistry = new ChannelRegistry()) {
    for (const adapter of adapters) this.adapters.set(adapter.platform, adapter);
    this.registry = registry;
  }

  attach(): void {
    for (const adapter of this.adapters.values()) {
      adapter.onMessage((msg) => this.handle(msg));
    }
  }

  /** Re-tail known channels after a restart so missed proactive output renders. */
  resume(): void {
    for (const entry of this.registry.all()) {
      const adapter = this.adapters.get(entry.platform);
      if (!adapter) continue;
      this.ensureMirror(entry.sessionId, adapter, entry.channelId, entry.offset).resume();
    }
  }

  private async handle(msg: IncomingMessage): Promise<void> {
    const adapter = this.adapters.get(msg.platform);
    if (!adapter || !msg.text) return;
    const sessionId = sessionIdFor(msg.platform, msg.channelId);
    const hookCtx: MessageHookContext = {
      sessionId,
      msg,
      adapter,
      addressed: msg.mentionsBot,
      registered: this.registry.get(sessionId) !== undefined,
    };

    // Let observing hooks see every message (e.g. recall ingestion). Best-effort.
    for (const hooks of messageHooks()) void hooks.onMessage?.(hookCtx);

    if (msg.mentionsBot) {
      await this.handleAddressed(adapter, msg, sessionId, hookCtx);
    } else {
      await this.handleAmbient(adapter, msg, sessionId, hookCtx);
    }
  }

  /** Directly addressed: a control command, or a normal agent turn. */
  private async handleAddressed(
    adapter: PlatformAdapter,
    msg: IncomingMessage,
    sessionId: string,
    hookCtx: MessageHookContext,
  ): Promise<void> {
    const command = this.matchCommand(msg.text);
    if (command) {
      await this.runCommand(adapter, msg, sessionId, command);
      return;
    }
    await this.runBeforeSubmit(hookCtx);
    await this.submit(adapter, msg, sessionId, `${msg.userDisplay}: ${msg.text}`);
  }

  /** Overheard (not addressed): chime in only if every ambient gate agrees. */
  private async handleAmbient(
    adapter: PlatformAdapter,
    msg: IncomingMessage,
    sessionId: string,
    hookCtx: MessageHookContext,
  ): Promise<void> {
    for (const hooks of messageHooks()) {
      if (hooks.shouldChimeIn && !(await hooks.shouldChimeIn(hookCtx))) return;
    }
    await this.runBeforeSubmit(hookCtx);
    await this.submit(adapter, msg, sessionId, `[overheard in the channel] ${msg.userDisplay}: ${msg.text}`);
  }

  /** First plugin command whose parse matches wins (manifest order). */
  private matchCommand(text: string): ParsedCommand | null {
    for (const spec of allCommands()) {
      const parsed = spec.parse(text);
      if (parsed) return parsed;
    }
    return null;
  }

  private async runBeforeSubmit(hookCtx: MessageHookContext): Promise<void> {
    for (const hooks of messageHooks()) await hooks.onBeforeSubmit?.(hookCtx);
  }

  private async runCommand(
    adapter: PlatformAdapter,
    msg: IncomingMessage,
    sessionId: string,
    command: ParsedCommand,
  ): Promise<void> {
    if (command.mutating && !(await this.authorize(adapter, msg))) {
      await adapter.send(
        msg.channelId,
        { text: 'Only channel admins can change my settings.' },
        { replyTo: msg.messageId },
      );
      return;
    }
    const ctx: CommandContext = { sessionId, msg, adapter };
    await adapter.send(msg.channelId, { text: await command.run(ctx) }, { replyTo: msg.messageId });
  }

  /** Allowlist wins when set; otherwise defer to the platform's own roles. */
  private async authorize(adapter: PlatformAdapter, msg: IncomingMessage): Promise<boolean> {
    if (hasAdminAllowlist()) return inAllowlist(msg.platform, msg.userId);
    if (adapter.isChannelAdmin) return adapter.isChannelAdmin(msg.channelId, msg.userId);
    return true;
  }

  private async submit(
    adapter: PlatformAdapter,
    msg: IncomingMessage,
    sessionId: string,
    text: string,
  ): Promise<void> {
    this.registry.remember(sessionId, msg.platform, msg.channelId);
    const mirror = this.ensureMirror(sessionId, adapter, msg.channelId, this.registry.get(sessionId)?.offset);
    try {
      await mirror.submit(text, msg.messageId);
    } catch (err) {
      console.error(`[open-tag] submit failed (${msg.platform}):`, err);
    }
  }

  private ensureMirror(
    sessionId: string,
    adapter: PlatformAdapter,
    channelId: string,
    startOffset?: string,
  ): SessionMirror {
    let mirror = this.mirrors.get(sessionId);
    if (!mirror) {
      mirror = new SessionMirror(adapter, channelId, sessionId, {
        startOffset,
        onOffset: (offset) => this.registry.setOffset(sessionId, offset),
      });
      this.mirrors.set(sessionId, mirror);
    }
    return mirror;
  }
}
