/**
 * Admin authorization for mutating control commands (roadmap step 5).
 *
 * Set OPEN_TAG_ADMINS to a comma-separated list of `platform:userId` (e.g.
 * "telegram:12345,discord:67890") to restrict who can change channel settings.
 * Left unset, every user is an admin — the right default for single-tenant,
 * self-hosted, trusted deployments. Platform-native role checks (Telegram chat
 * admins, Discord permissions) are a future refinement.
 */
import type { Platform } from '../platform/types.ts';

export function isAdmin(platform: Platform, userId: string): boolean {
  const raw = process.env.OPEN_TAG_ADMINS?.trim();
  if (!raw) return true; // open by default for trusted single-tenant deploys.
  const allowed = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  return allowed.has(`${platform}:${userId}`);
}
