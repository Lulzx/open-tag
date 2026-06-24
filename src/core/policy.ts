/**
 * Per-channel policy (roadmap step 5): RBAC over tools + model-picker.
 *
 *   channel → { model override, denied tools }
 *
 * Enforced at agent initialization (see `agents/teammate.ts`): the per-channel
 * model is selected and denied tools are filtered out BEFORE the model sees the
 * tool list, so a denied capability can never be called (DESIGN.md §5).
 *
 * Single writer (the bot, via admin commands), many readers (the server, at
 * each agent init). Writes are atomic (temp + rename) so a reader never sees a
 * torn file. Read fresh each call so policy changes apply to subsequent turns.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ChannelPolicy {
  /** Per-channel model override; falls back to DEFAULT_MODEL when unset. */
  model?: string;
  /** Tool names the channel may NOT use. */
  toolDeny: string[];
  /** MCP server names the channel MAY use. Default empty = deny all (opt-in). */
  mcpAllow: string[];
}

const DEFAULT_POLICY: ChannelPolicy = { toolDeny: [], mcpAllow: [] };
const storePath = process.env.OPEN_TAG_POLICY_PATH ?? './data/channel-policy.json';

function readAll(): Record<string, ChannelPolicy> {
  try {
    if (!existsSync(storePath)) return {};
    return JSON.parse(readFileSync(storePath, 'utf8')) as Record<string, ChannelPolicy>;
  } catch (err) {
    console.error('[policy] read failed:', err);
    return {};
  }
}

function writeAll(all: Record<string, ChannelPolicy>): void {
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    const tmp = `${storePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2));
    renameSync(tmp, storePath); // atomic swap — readers never see a partial file.
  } catch (err) {
    console.error('[policy] write failed:', err);
  }
}

/** The effective policy for a channel (defaults merged in). */
export function getPolicy(sessionId: string): ChannelPolicy {
  return { ...DEFAULT_POLICY, ...readAll()[sessionId] };
}

function update(sessionId: string, change: (policy: ChannelPolicy) => ChannelPolicy): ChannelPolicy {
  const all = readAll();
  const next = change({ ...DEFAULT_POLICY, ...all[sessionId] });
  all[sessionId] = next;
  writeAll(all);
  return next;
}

export function setModel(sessionId: string, model: string | undefined): ChannelPolicy {
  return update(sessionId, (p) => ({ ...p, model }));
}

export function denyTool(sessionId: string, name: string): ChannelPolicy {
  return update(sessionId, (p) => ({ ...p, toolDeny: [...new Set([...p.toolDeny, name])] }));
}

export function allowTool(sessionId: string, name: string): ChannelPolicy {
  return update(sessionId, (p) => ({ ...p, toolDeny: p.toolDeny.filter((n) => n !== name) }));
}

export function resetTools(sessionId: string): ChannelPolicy {
  return update(sessionId, (p) => ({ ...p, toolDeny: [] }));
}

export function allowMcp(sessionId: string, name: string): ChannelPolicy {
  return update(sessionId, (p) => ({ ...p, mcpAllow: [...new Set([...p.mcpAllow, name])] }));
}

export function denyMcp(sessionId: string, name: string): ChannelPolicy {
  return update(sessionId, (p) => ({ ...p, mcpAllow: p.mcpAllow.filter((n) => n !== name) }));
}

export function resetMcp(sessionId: string): ChannelPolicy {
  return update(sessionId, (p) => ({ ...p, mcpAllow: [] }));
}
