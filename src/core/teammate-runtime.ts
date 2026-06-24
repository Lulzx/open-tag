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
import { hasAdminAllowlist, inAllowlist } from './admin.ts';
import { RateLimiter, shouldChimeIn } from './ambient.ts';
import { ChannelConfigStore } from './channel-config.ts';
import { ChannelRegistry } from './channel-registry.ts';
import { type Command, HELP_TEXT, isMutating, parseCommand } from './commands.ts';
import { allowMcp, allowTool, denyMcp, denyTool, getPolicy, resetMcp, resetTools, setModel } from './policy.ts';
import { index } from './recall.ts';
import { SessionMirror } from './session-mirror.ts';
import { sessionIdFor } from './session.ts';
import { mcpServerNames } from '../shared/mcp-config.ts';
import { DEFAULT_MODEL } from '../shared/model.ts';
import { TOOL_CATALOG } from '../shared/tool-catalog.ts';
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

    // Record raw channel history for semantic recall — every message in a
    // channel already using the bot (no-op unless DATABASE_URL is set).
    if (this.registry.get(sessionId) && msg.text.trim().length >= 12) {
      void index(sessionId, 'message', `${msg.userDisplay}: ${msg.text}`);
    }

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
    if (isMutating(command) && !(await this.authorize(adapter, msg))) {
      await adapter.send(
        msg.channelId,
        { text: 'Only channel admins can change my settings.' },
        { replyTo: msg.messageId },
      );
      return;
    }
    await adapter.send(msg.channelId, { text: this.executeCommand(sessionId, command) }, { replyTo: msg.messageId });
  }

  /** Allowlist wins when set; otherwise defer to the platform's own roles. */
  private async authorize(adapter: PlatformAdapter, msg: IncomingMessage): Promise<boolean> {
    if (hasAdminAllowlist()) return inAllowlist(msg.platform, msg.userId);
    if (adapter.isChannelAdmin) return adapter.isChannelAdmin(msg.channelId, msg.userId);
    return true;
  }

  private executeCommand(sessionId: string, command: Command): string {
    switch (command.kind) {
      case 'help':
        return HELP_TEXT;
      case 'settings': {
        const policy = getPolicy(sessionId);
        const denied = policy.toolDeny.length > 0 ? policy.toolDeny.join(', ') : 'none';
        const mcp = policy.mcpAllow.length > 0 ? policy.mcpAllow.join(', ') : 'none';
        return [
          'Settings for this channel:',
          `• ambient: ${this.config.get(sessionId).ambient ? 'on' : 'off'}`,
          `• model: ${policy.model ?? `${DEFAULT_MODEL} (default)`}`,
          `• disabled tools: ${denied}`,
          `• MCP connectors: ${mcp}`,
        ].join('\n');
      }
      case 'ambient': {
        if (command.arg === 'status') {
          return `Ambient mode is ${this.config.get(sessionId).ambient ? 'on' : 'off'} for this channel.`;
        }
        const on = command.arg === 'on';
        this.config.setAmbient(sessionId, on);
        return on
          ? "Ambient mode enabled — I'll chime in when I think I can help."
          : "Ambient mode disabled — I'll only respond when @mentioned.";
      }
      case 'model-show':
        return `Model: ${getPolicy(sessionId).model ?? `${DEFAULT_MODEL} (default)`}`;
      case 'model-reset':
        setModel(sessionId, undefined);
        return `Model reset to the default (${DEFAULT_MODEL}). Applies to new turns.`;
      case 'model-set':
        if (!command.model.includes('/')) {
          return 'Model must look like `provider/model`, e.g. `ollama/gpt-oss:120b`.';
        }
        setModel(sessionId, command.model);
        return `Model set to \`${command.model}\` for this channel. Applies to new turns.`;
      case 'tools-list': {
        const denied = new Set(getPolicy(sessionId).toolDeny);
        const lines = TOOL_CATALOG.map((name) => `${denied.has(name) ? '🚫' : '✅'} ${name}`);
        return ['Tools for this channel:', ...lines].join('\n');
      }
      case 'tools-reset':
        resetTools(sessionId);
        return 'All tools re-enabled for this channel. Applies to new turns.';
      case 'tools-allow':
        allowTool(sessionId, command.name);
        return `Enabled \`${command.name}\`. Applies to new turns.`;
      case 'tools-deny': {
        denyTool(sessionId, command.name);
        const known = TOOL_CATALOG.includes(command.name) ? '' : ' (note: not a known tool name)';
        return `Disabled \`${command.name}\`${known} for this channel. Applies to new turns.`;
      }
      case 'mcp-list': {
        const allowed = new Set(getPolicy(sessionId).mcpAllow);
        const servers = mcpServerNames();
        if (servers.length === 0) return 'No MCP servers are configured (set OPEN_TAG_MCP_SERVERS).';
        const lines = servers.map((name) => `${allowed.has(name) ? '✅' : '🚫'} ${name}`);
        return ['MCP connectors for this channel (default off):', ...lines].join('\n');
      }
      case 'mcp-reset':
        resetMcp(sessionId);
        return 'All MCP connectors disabled for this channel. Applies to new turns.';
      case 'mcp-allow': {
        allowMcp(sessionId, command.name);
        const known = mcpServerNames().includes(command.name) ? '' : ' (note: not a configured server)';
        return `Enabled MCP server \`${command.name}\`${known} for this channel. Applies to new turns.`;
      }
      case 'mcp-deny':
        denyMcp(sessionId, command.name);
        return `Disabled MCP server \`${command.name}\` for this channel. Applies to new turns.`;
    }
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
