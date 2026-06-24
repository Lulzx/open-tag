/**
 * Normalized platform contracts (DESIGN.md §4).
 *
 * The platform seam stays OURS even for channels Flue ships, so multiplayer
 * semantics are uniform across Telegram / Discord / Slack. A new platform is
 * one new file implementing `PlatformAdapter`; nothing above this layer changes.
 */

export type Platform = 'telegram' | 'discord' | 'slack';

/** Capability flags so the product layer can adapt without per-platform branches. */
export interface PlatformCaps {
  /** Native threads (Slack/Discord) vs reply-chains (Telegram). */
  threads: boolean;
  /** Can we "stream" by editing a message in place? */
  editMessages: boolean;
  /** Slack blocks / Discord embeds available? */
  richBlocks: boolean;
  /** Chunking threshold for a single outbound message. */
  maxMessageLen: number;
}

export interface Attachment {
  type: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
}

/** Every inbound platform event normalizes to this one shape. */
export interface IncomingMessage {
  platform: Platform;
  /** Session-key component — the channel/chat the message belongs to. */
  channelId: string;
  /** Reply/thread anchor, when the platform has one. */
  threadId?: string;
  messageId: string;
  userId: string;
  userDisplay: string;
  text: string;
  /** Explicit @mention / DM (addressed to the bot) vs ambient channel chatter. */
  mentionsBot: boolean;
  attachments: Attachment[];
  caps: PlatformCaps;
  /** Escape hatch to the native provider payload. */
  raw: unknown;
}

/** Core emits markdown + intent; the adapter owns platform-specific formatting. */
export interface OutboundContent {
  text: string;
}

export interface SendOpts {
  /** Anchor the outbound message as a reply to this inbound message id. */
  replyTo?: string;
}

/** Opaque handle to a sent message, used for edit-in-place streaming. */
export interface MessageHandle {
  channelId: string;
  messageId: string;
}

/**
 * The one interface a platform must implement. `send`/`edit` are the
 * streaming primitives — "streaming" is editing a message in place, throttled.
 */
export interface PlatformAdapter {
  readonly platform: Platform;
  readonly caps: PlatformCaps;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (m: IncomingMessage) => void | Promise<void>): void;
  send(channelId: string, content: OutboundContent, opts?: SendOpts): Promise<MessageHandle>;
  edit(handle: MessageHandle, content: OutboundContent): Promise<void>;
  /** "Working…" affordance. Best-effort; not all platforms support it. */
  react?(handle: MessageHandle, emoji: string): Promise<void>;
}
