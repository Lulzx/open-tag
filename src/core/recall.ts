/**
 * Per-channel semantic recall over pgvector (DESIGN.md §5/§6).
 *
 * Durable facts (memory.ts) are injected into the prompt, but as a channel
 * accumulates many of them, injecting all is wasteful. This adds embeddings +
 * vector search so the agent can pull only the passages relevant to a question
 * ("what did we decide about X") via the recall_context tool.
 *
 * Feature-flagged on DATABASE_URL: when unset, recall is disabled and the bot
 * falls back to plain injected facts — the app runs with zero extra infra.
 * Embeddings go through any OpenAI-compatible /embeddings endpoint (Vercel AI
 * Gateway, Ollama Cloud, …) so the provider stays swappable like the chat model.
 *
 * Server-side only. Untested against a live Postgres in this repo — bring your
 * own pgvector (see docker-compose.yml) and an embeddings-capable key.
 */
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const EMBED_MODEL = process.env.OPEN_TAG_EMBED_MODEL ?? 'text-embedding-3-small';
const EMBED_DIM = Number(process.env.OPEN_TAG_EMBED_DIM ?? 1536);
const EMBED_BASE_URL = (
  process.env.OPEN_TAG_EMBED_BASE_URL ??
  process.env.AI_GATEWAY_BASE_URL ??
  process.env.OLLAMA_BASE_URL ??
  'https://ai-gateway.vercel.sh/v1'
).replace(/\/$/, '');
const EMBED_API_KEY =
  process.env.OPEN_TAG_EMBED_API_KEY ?? process.env.AI_GATEWAY_API_KEY ?? process.env.OLLAMA_API_KEY;

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

export function recallEnabled(): boolean {
  return Boolean(DATABASE_URL);
}

function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL });
  return pool;
}

function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const db = getPool();
      await db.query('CREATE EXTENSION IF NOT EXISTS vector');
      await db.query(
        `CREATE TABLE IF NOT EXISTS channel_memory (
           id bigserial PRIMARY KEY,
           session_id text NOT NULL,
           kind text NOT NULL,
           content text NOT NULL,
           embedding vector(${EMBED_DIM}) NOT NULL,
           created_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      await db.query('CREATE INDEX IF NOT EXISTS channel_memory_session_idx ON channel_memory (session_id)');
    })().catch((err) => {
      ready = null; // allow a later retry instead of caching the failure.
      throw err;
    });
  }
  return ready;
}

/** pgvector accepts a vector literal like '[1,2,3]'::vector. */
function toVector(values: number[]): string {
  return `[${values.join(',')}]`;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${EMBED_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(EMBED_API_KEY ? { authorization: `Bearer ${EMBED_API_KEY}` } : {}),
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`embeddings request failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding) throw new Error('embeddings response had no vector');
  return embedding;
}

/** Embed and store one piece of channel content. Best-effort; never throws. */
export async function index(sessionId: string, kind: string, content: string): Promise<void> {
  if (!recallEnabled()) return;
  try {
    await ensureReady();
    const vector = await embed(content);
    await getPool().query(
      'INSERT INTO channel_memory (session_id, kind, content, embedding) VALUES ($1, $2, $3, $4::vector)',
      [sessionId, kind, content, toVector(vector)],
    );
  } catch (err) {
    console.error('[recall] index failed:', err);
  }
}

/** Return the channel's most semantically relevant stored passages. */
export async function search(sessionId: string, query: string, k = 5): Promise<string[]> {
  if (!recallEnabled()) return [];
  await ensureReady();
  const vector = await embed(query);
  const { rows } = await getPool().query<{ content: string }>(
    'SELECT content FROM channel_memory WHERE session_id = $1 ORDER BY embedding <=> $2::vector LIMIT $3',
    [sessionId, toVector(vector), k],
  );
  return rows.map((row) => row.content);
}
