/**
 * Admin authorization for mutating control commands (roadmap step 5).
 *
 * Two layers, allowlist first:
 *   1. OPEN_TAG_ADMINS — a comma-separated `platform:userId` allowlist. When
 *      set it is authoritative (explicit override for any platform).
 *   2. Otherwise, the platform's own roles decide (Telegram chat admins,
 *      Discord guild permissions) via `adapter.isChannelAdmin`. DMs count as
 *      admin. If the adapter can't decide, access is open (trusted single-tenant).
 */
import type { Platform } from '../platform/types.ts';

function allowlist(): Set<string> | null {
  const raw = process.env.OPEN_TAG_ADMINS?.trim();
  if (!raw) return null;
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

/** True when an explicit OPEN_TAG_ADMINS allowlist is configured. */
export function hasAdminAllowlist(): boolean {
  return allowlist() !== null;
}

/** Whether `platform:userId` is in the configured allowlist (false if none). */
export function inAllowlist(platform: Platform, userId: string): boolean {
  return allowlist()?.has(`${platform}:${userId}`) ?? false;
}
