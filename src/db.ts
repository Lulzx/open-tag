/**
 * Durable state for agent sessions (DESIGN.md §6 — "session durability").
 *
 * Default: file-backed SQLite — the durable-execution property comes from
 * Flue/Pi, we just point it at a file. Set DATABASE_URL to put Flue's session
 * history, submissions, and run records on Postgres instead (multi-replica /
 * host-loss durable), which pairs naturally with the pgvector semantic recall
 * in `core/recall.ts`. One env var, no code change.
 *
 * `@flue/postgres` is driver-agnostic; we wrap a node-postgres Pool (the same
 * driver recall.ts uses) in its PostgresRunner shape.
 */
import { postgres, type PostgresQuery } from '@flue/postgres';
import { sqlite } from '@flue/runtime/node';
import { Pool } from 'pg';
import type { PersistenceAdapter } from '@flue/runtime/internal';

function postgresAdapter(connectionString: string): PersistenceAdapter {
  const pool = new Pool({ connectionString });
  const query: PostgresQuery = async (text, params) => (await pool.query(text, params)).rows;

  return postgres({
    query,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async (text, params) => (await client.query(text, params)).rows });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  });
}

export default process.env.DATABASE_URL
  ? postgresAdapter(process.env.DATABASE_URL)
  : sqlite(process.env.OPEN_TAG_DB_PATH ?? './data/flue.db');
