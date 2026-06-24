/**
 * Durable state for agent sessions (DESIGN.md §6 — "session durability").
 *
 * File-backed SQLite so per-channel conversation history survives a restart —
 * the durable-execution property comes from Flue/Pi, we just point it at a file.
 * Swap to `@flue/postgres` for multi-replica / pgvector recall in later steps.
 */
import { sqlite } from '@flue/runtime/node';

export default sqlite(process.env.OPEN_TAG_DB_PATH ?? './data/flue.db');
