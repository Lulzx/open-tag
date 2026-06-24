/**
 * Built-in teammate tools.
 *
 * These prove tool-calling in the agent loop without depending on an external
 * MCP server. Per-channel MCP connectors (DESIGN.md §5, roadmap step 5) attach
 * the same way — `connectMcpServer(...)` surfaces an MCP server's tools as Flue
 * tools, gated by the per-channel permission policy — so this list is the seam
 * where richer connectors plug in later.
 */
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

const getCurrentTime = defineTool({
  name: 'get_current_time',
  description: 'Get the current date and time, optionally in a specific IANA timezone.',
  input: v.object({
    timezone: v.optional(
      v.pipe(v.string(), v.description('IANA timezone, e.g. "Europe/London". Defaults to UTC.')),
    ),
  }),
  output: v.object({ iso: v.string(), formatted: v.string(), timezone: v.string() }),
  async run({ input }) {
    const timezone = input.timezone ?? 'UTC';
    const now = new Date();
    try {
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(now);
      return { iso: now.toISOString(), formatted, timezone };
    } catch {
      throw new Error(`Unknown timezone: ${timezone}`);
    }
  },
});

const SAFE_EXPR = /^[\d+\-*/(). %]+$/;

const calculate = defineTool({
  name: 'calculate',
  description: 'Evaluate a basic arithmetic expression (+, -, *, /, %, parentheses).',
  input: v.object({
    expression: v.pipe(v.string(), v.description('e.g. "(3 + 4) * 12 / 2"')),
  }),
  output: v.object({ result: v.number() }),
  async run({ input }) {
    const expr = input.expression.trim();
    if (!SAFE_EXPR.test(expr)) {
      throw new Error('Expression may only contain numbers and + - * / % ( ) characters.');
    }
    // eslint-disable-next-line no-new-func -- input is hard-restricted by SAFE_EXPR above.
    const result = Function(`"use strict"; return (${expr});`)() as unknown;
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error('Expression did not evaluate to a finite number.');
    }
    return { result };
  },
});

const fetchUrl = defineTool({
  name: 'fetch_url',
  description: 'Fetch the text content at an http(s) URL. Returns up to ~8 KB of the body.',
  input: v.object({
    url: v.pipe(v.string(), v.url(), v.description('Absolute http(s) URL.')),
  }),
  output: v.object({ status: v.number(), contentType: v.string(), body: v.string() }),
  async run({ input, signal }) {
    const url = new URL(input.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http(s) URLs are allowed.');
    }
    const res = await fetch(url, { signal, redirect: 'follow' });
    const text = await res.text();
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? 'unknown',
      body: text.slice(0, 8192),
    };
  },
});

/** Tools available to the per-channel teammate agent. */
export const teammateTools = [getCurrentTime, calculate, fetchUrl];
