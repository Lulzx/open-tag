/**
 * Per-channel durable memory (roadmap step 4).
 *
 * Two layers of "stop re-explaining":
 *   1. Rolling conversation memory — already provided by Flue's continuing
 *      per-channel session + automatic compaction. Nothing to build.
 *   2. Explicit facts — durable decisions/preferences the agent chooses to keep
 *      ("deploys are Fridays", "staging URL is ..."). Stored here, injected into
 *      the system prompt per channel so they survive compaction and restarts.
 *
 * A JSON file keeps the spine self-contained; pgvector semantic recall over raw
 * history is the Postgres follow-on (DESIGN.md §5/§6).
 *
 * Server-side (imported by the teammate agent). No SDK import — keep it out of
 * the server bundle's dependency surface.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const storePath = process.env.OPEN_TAG_MEMORY_PATH ?? './data/memory.json';
const facts = new Map<string, string[]>();
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!existsSync(storePath)) return;
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as Record<string, string[]>;
    for (const [sessionId, list] of Object.entries(parsed)) facts.set(sessionId, list);
  } catch (err) {
    console.error('[memory] load failed:', err);
  }
}

function persist(): void {
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify(Object.fromEntries(facts), null, 2));
  } catch (err) {
    console.error('[memory] persist failed:', err);
  }
}

/** Facts remembered for a channel, in the order they were added. */
export function recall(sessionId: string): string[] {
  ensureLoaded();
  return [...(facts.get(sessionId) ?? [])];
}

/** Remember a durable fact. Returns the new fact count for the channel. */
export function remember(sessionId: string, fact: string): number {
  ensureLoaded();
  const list = facts.get(sessionId) ?? [];
  const trimmed = fact.trim();
  if (trimmed && !list.includes(trimmed)) {
    list.push(trimmed);
    facts.set(sessionId, list);
    persist();
  }
  return list.length;
}

/** Forget a fact by exact text or first case-insensitive substring match. */
export function forget(sessionId: string, fact: string): boolean {
  ensureLoaded();
  const list = facts.get(sessionId) ?? [];
  const needle = fact.trim().toLowerCase();
  const index = list.findIndex((f) => f === fact || f.toLowerCase().includes(needle));
  if (index < 0) return false;
  list.splice(index, 1);
  facts.set(sessionId, list);
  persist();
  return true;
}
