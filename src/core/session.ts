/**
 * Multiplayer session keying (DESIGN.md §5).
 *
 * Session key = (platform, channelId). ONE agent instance per channel — this is
 * what separates open-tag from a per-user bot: everyone in a channel talks to
 * the same continuing agent. Concurrent turns are serialized by Flue's durable
 * per-instance submission queue, so no bot-side lock is needed.
 */
import type { Platform } from '../platform/types.ts';

/** The shared per-channel session id — also the Flue agent instance id. */
export function sessionIdFor(platform: Platform, channelId: string): string {
  return `${platform}:${channelId}`;
}
