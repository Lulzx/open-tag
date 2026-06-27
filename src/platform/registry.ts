/**
 * Open platform-adapter registry.
 *
 * A platform is registered as an `AdapterFactory` — `fromEnv()` builds the
 * adapter when its env var is present, or returns null when the platform is not
 * configured. The launcher (`bot/index.ts`) selects whichever factories are
 * configured, so adding a platform is a new adapter file plus one entry in
 * `adapters.ts` — no edits to the launcher or any product-layer file.
 */
import type { PlatformAdapter } from './types.ts';

export interface AdapterFactory {
  /** Platform identifier, e.g. 'telegram', 'discord', 'msteams'. */
  platform: string;
  /** The env var that configures this platform, shown in the "nothing set" hint. */
  envHint: string;
  /** Build the adapter from the environment, or null when not configured. */
  fromEnv(): PlatformAdapter | null;
}

/** Instantiate every adapter whose env var is set. */
export function selectAdapters(factories: AdapterFactory[]): PlatformAdapter[] {
  return factories
    .map((factory) => factory.fromEnv())
    .filter((adapter): adapter is PlatformAdapter => adapter !== null);
}
