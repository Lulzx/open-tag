/**
 * MCP server configuration parsing (roadmap follow-on: bundled connectors).
 *
 * Operators bundle MCP servers via OPEN_TAG_MCP_SERVERS, a JSON array, e.g.
 *   [{"name":"github","url":"https://mcp.example/github","transport":"streamable-http"}]
 *
 * Pure env parsing with no Flue import, so both the server (to connect, in
 * core/mcp.ts) and the bot (to list/validate, in admin commands) can use it.
 */
export interface McpServerConfig {
  name: string;
  url: string;
  transport?: 'streamable-http' | 'sse';
  headers?: Record<string, string>;
}

export function parseMcpServers(): McpServerConfig[] {
  const raw = process.env.OPEN_TAG_MCP_SERVERS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is McpServerConfig =>
        Boolean(s) && typeof s.name === 'string' && typeof s.url === 'string',
    );
  } catch (err) {
    console.error('[mcp] OPEN_TAG_MCP_SERVERS is not valid JSON:', err);
    return [];
  }
}

export function mcpServerNames(): string[] {
  return parseMcpServers().map((s) => s.name);
}
