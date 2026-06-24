/**
 * The product layer, platform-agnostic (DESIGN.md §2).
 *
 *   incoming message  →  shared per-channel session  (multiplayer key)
 *                     →  Flue teammate agent          (submit + mirror)
 *                     →  every assistant turn rendered to the channel
 *
 * `TeammateRuntime` knows nothing about Telegram or Discord — it speaks only
 * `PlatformAdapter`. It owns one `SessionMirror` per channel; the mirror's
 * persistent tail is what carries proactive (scheduled/ambient) output back to
 * the channel, not just direct replies.
 */
import { ChannelRegistry } from './channel-registry.ts';
import { SessionMirror } from './session-mirror.ts';
import { sessionIdFor } from './session.ts';
import type { IncomingMessage, Platform, PlatformAdapter } from '../platform/types.ts';

export class TeammateRuntime {
  private readonly adapters = new Map<Platform, PlatformAdapter>();
  private readonly registry: ChannelRegistry;
  private readonly mirrors = new Map<string, SessionMirror>();

  constructor(adapters: PlatformAdapter[], registry: ChannelRegistry = new ChannelRegistry()) {
    for (const adapter of adapters) this.adapters.set(adapter.platform, adapter);
    this.registry = registry;
  }

  /** Wire every configured adapter's inbound messages into the product layer. */
  attach(): void {
    for (const adapter of this.adapters.values()) {
      adapter.onMessage((msg) => this.handle(msg));
    }
  }

  /** Re-tail known channels after a restart so missed proactive output renders. */
  resume(): void {
    for (const entry of this.registry.all()) {
      const adapter = this.adapters.get(entry.platform);
      if (!adapter) continue; // platform not configured this run.
      this.ensureMirror(entry.sessionId, adapter, entry.channelId, entry.offset).resume();
    }
  }

  private async handle(msg: IncomingMessage): Promise<void> {
    // Spine: respond only when addressed. Ambient triage on non-mentions is step 4.
    if (!msg.mentionsBot || !msg.text) return;
    const adapter = this.adapters.get(msg.platform);
    if (!adapter) return;

    const sessionId = sessionIdFor(msg.platform, msg.channelId);
    this.registry.remember(sessionId, msg.platform, msg.channelId);
    const mirror = this.ensureMirror(sessionId, adapter, msg.channelId, this.registry.get(sessionId)?.offset);

    try {
      // Prefix the speaker's name so the shared session knows who said what.
      await mirror.submit(`${msg.userDisplay}: ${msg.text}`, msg.messageId);
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
