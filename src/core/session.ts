/**
 * Multiplayer session keying + per-channel serialization.
 *
 * Session key = (platform, channelId). ONE agent instance per channel — this
 * single choice is what separates open-tag from a normal per-user bot
 * (DESIGN.md §5). Concurrent @mentions in the same channel are serialized by a
 * per-channel lock so they queue instead of racing the shared session.
 */
import type { Platform } from '../platform/types.ts';

/** The shared per-channel session id — also the Flue agent instance id. */
export function sessionIdFor(platform: Platform, channelId: string): string {
  return `${platform}:${channelId}`;
}

const chains = new Map<string, Promise<unknown>>();

/**
 * Run `fn` with exclusive access to a channel's session. Calls for the same
 * sessionId run strictly in submission order; different channels run freely.
 */
export function withChannelLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(sessionId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Keep the chain alive but don't leak rejections into the next waiter's tail.
  chains.set(
    sessionId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}
