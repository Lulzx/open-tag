/**
 * Per-channel settings the BOT acts on (roadmap step 4).
 *
 * Currently just the ambient-mode flag — default OFF, so the bot only speaks
 * when @mentioned until a channel opts in (DESIGN.md §5: "Default: off until
 * enabled per channel"). Persisted to JSON so the choice survives restarts.
 *
 * Bot-owned, separate from server-owned policy (model/permissions, step 5) so
 * the two processes never write the same file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ChannelConfig {
  ambient: boolean;
}

const DEFAULT_CONFIG: ChannelConfig = { ambient: false };

export class ChannelConfigStore {
  private readonly path: string;
  private readonly configs = new Map<string, ChannelConfig>();

  constructor(path = process.env.OPEN_TAG_CONFIG_PATH ?? './data/channel-config.json') {
    this.path = path;
    this.load();
  }

  get(sessionId: string): ChannelConfig {
    return { ...DEFAULT_CONFIG, ...this.configs.get(sessionId) };
  }

  setAmbient(sessionId: string, ambient: boolean): void {
    const config = this.configs.get(sessionId) ?? { ...DEFAULT_CONFIG };
    config.ambient = ambient;
    this.configs.set(sessionId, config);
    this.persist();
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return;
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, ChannelConfig>;
      for (const [sessionId, config] of Object.entries(parsed)) this.configs.set(sessionId, config);
    } catch (err) {
      console.error('[config] load failed:', err);
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(Object.fromEntries(this.configs), null, 2));
    } catch (err) {
      console.error('[config] persist failed:', err);
    }
  }
}
