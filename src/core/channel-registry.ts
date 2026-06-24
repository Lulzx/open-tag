/**
 * ChannelRegistry — the bot's durable record of which channels it mirrors.
 *
 * Persists `sessionId → { platform, channelId, offset }` so that after a bot
 * restart it can re-tail every known channel from where it left off, catching
 * up any proactive/scheduled output the agent produced while the bot was down.
 * State that must survive (conversation history, scheduled tasks) lives in the
 * Flue server; this file is just the bot's small delivery bookkeeping.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Platform } from '../platform/types.ts';

export interface ChannelEntry {
  sessionId: string;
  platform: Platform;
  channelId: string;
  /** Last durable stream offset rendered to this channel. */
  offset?: string;
}

export class ChannelRegistry {
  private readonly path: string;
  private readonly entries = new Map<string, ChannelEntry>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(path = process.env.OPEN_TAG_CHANNELS_PATH ?? './data/channels.json') {
    this.path = path;
    this.load();
  }

  all(): ChannelEntry[] {
    return [...this.entries.values()];
  }

  get(sessionId: string): ChannelEntry | undefined {
    return this.entries.get(sessionId);
  }

  remember(sessionId: string, platform: Platform, channelId: string): void {
    if (this.entries.has(sessionId)) return;
    this.entries.set(sessionId, { sessionId, platform, channelId });
    this.persistNow();
  }

  setOffset(sessionId: string, offset: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.offset === offset) return;
    entry.offset = offset;
    this.schedulePersist(); // debounced — offsets advance per stream batch.
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return;
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as ChannelEntry[];
      for (const entry of parsed) this.entries.set(entry.sessionId, entry);
    } catch (err) {
      console.error('[registry] load failed:', err);
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, 2000);
  }

  private persistNow(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.all(), null, 2));
    } catch (err) {
      console.error('[registry] persist failed:', err);
    }
  }
}
