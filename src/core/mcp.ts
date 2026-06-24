/**
 * MCP connectors surfaced as Flue tools (DESIGN.md §3/§5).
 *
 * `connectMcpServer` adapts a remote MCP server's tools into Flue tools named
 * `mcp__<server>__<tool>`. We connect each configured server once and cache the
 * result, then hand a channel only the tools for the servers it has explicitly
 * allowed (default deny — connectors are opt-in per channel, see policy.ts).
 *
 * Server-side only (imported by the teammate agent).
 */
import { connectMcpServer, type ToolDefinition } from '@flue/runtime';
import { parseMcpServers } from '../shared/mcp-config.ts';

let cache: Promise<Map<string, ToolDefinition[]>> | null = null;

function connectAll(): Promise<Map<string, ToolDefinition[]>> {
  if (!cache) {
    cache = (async () => {
      const byServer = new Map<string, ToolDefinition[]>();
      for (const cfg of parseMcpServers()) {
        try {
          const connection = await connectMcpServer(cfg.name, {
            url: cfg.url,
            ...(cfg.transport ? { transport: cfg.transport } : {}),
            ...(cfg.headers ? { headers: cfg.headers } : {}),
          });
          byServer.set(cfg.name, connection.tools);
          console.log(`[mcp] connected ${cfg.name} (${connection.tools.length} tools)`);
        } catch (err) {
          console.error(`[mcp] failed to connect ${cfg.name}:`, err);
          byServer.set(cfg.name, []);
        }
      }
      return byServer;
    })();
  }
  return cache;
}

/** Tools for the given allowed server names. Empty allowlist → no MCP tools. */
export async function getMcpToolsFor(allowed: string[]): Promise<ToolDefinition[]> {
  if (allowed.length === 0) return []; // default deny — connect nothing.
  const byServer = await connectAll();
  return allowed.flatMap((name) => byServer.get(name) ?? []);
}
