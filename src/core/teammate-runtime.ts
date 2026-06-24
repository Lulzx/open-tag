/**
 * The product layer, platform-agnostic (DESIGN.md §2).
 *
 *   incoming message  →  addressed?  →  command or agent turn
 *                     →  overheard?  →  ambient triage (opt-in, rate-limited)
 *                     →  Flue teammate agent  →  every turn mirrored to channel
 *
 * `TeammateRuntime` knows nothing about Telegram or Discord — it speaks only
 * `PlatformAdapter`. It owns one `SessionMirror` per channel; the mirror's
 * persistent tail carries proactive (scheduled/ambient) output back too.
 */
import { RateLimiter, shouldChimeIn } from './ambient.ts';
import { ChannelConfigStore } from './channel-config.ts';
import { ChannelRegistry } from './channel-registry.ts';
import { type Command, parseCommand } from './commands.ts';
import { SessionMirror } from './session-mirror.ts';
import { sessionIdFor } from './session.ts';
import type { IncomingMessage, Platform, PlatformAdapter } from '../platform/types.ts';

export class TeammateRuntime {
  private readonly adapters = new Map<Platform, PlatformAdapter>();
  private readonly registry: ChannelRegistry;
  private readonly config: ChannelConfigStore;
  private readonly mirrors = new Map<string, SessionMirror>();
  // Keep ambient mode quiet: at most a few self-initiated turns per channel/hour.
  private readonly ambientLimiter = new RateLimiter(4, 60 * 60 * 1000);

  constructor(
    adapters: PlatformAdapter[],
    registry: ChannelRegistry = new ChannelRegistry(),
    config: ChannelConfigStore = new ChannelConfigStore(),
  ) {
    for (const adapter of adapters) this.adapters.set(adapter.platform, adapter);
    this.registry = registry;
    this.config = config;
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

    if (msg.mentionsBot) {
      await this.handleAddressed(adapter, msg, sessionId);
    } else {
      await this.handleAmbient(adapter, msg, sessionId);
    }
  }

  /** Directly addressed: a control command, or a normal agent turn. */
  private async handleAddressed(
    adapter: PlatformAdapter,
    msg: IncomingMessage,
    sessionId: string,
  ): Promise<void> {
    const command = parseCommand(msg.text);
    if (command) {
      await this.runCommand(adapter, msg, sessionId, command);
      return;
    }
    // Quick ack so the channel sees we're on it (best-effort).
    await adapter.react?.({ channelId: msg.channelId, messageId: msg.messageId }, '👀').catch(() => {});
    await this.submit(adapter, msg, sessionId, `${msg.userDisplay}: ${msg.text}`);
  }

  /** Overheard (not addressed): chime in only if opted in, triaged, and in budget. */
  private async handleAmbient(
    adapter: PlatformAdapter,
    msg: IncomingMessage,
    sessionId: string,
  ): Promise<void> {
    if (!this.config.get(sessionId).ambient) return;
    if (!shouldChimeIn(msg.text)) return;
    if (!this.ambientLimiter.allow(sessionId)) return;
    await this.submit(adapter, msg, sessionId, `[overheard in the channel] ${msg.userDisplay}: ${msg.text}`);
  }

  private async runCommand(
    adapter: PlatformAdapter,
    msg: IncomingMessage,
    sessionId: string,
    command: Command,
  ): Promise<void> {
    let reply: string;
    if (command.arg === 'status') {
      reply = `Ambient mode is ${this.config.get(sessionId).ambient ? 'on' : 'off'} for this channel.`;
    } else {
      const on = command.arg === 'on';
      this.config.setAmbient(sessionId, on);
      reply = on
        ? "Ambient mode enabled — I'll chime in when I think I can help."
        : "Ambient mode disabled — I'll only respond when @mentioned.";
    }
    await adapter.send(msg.channelId, { text: reply }, { replyTo: msg.messageId });
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
