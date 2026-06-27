/**
 * Per-channel MCP connectors surfaced as agent tools (default deny).
 * Server-side: the channel's allowed server names come from its policy.
 *
 * No `toolNames` — MCP availability is listed separately by the `mcp` admin
 * command via the configured server names, not the static tool catalog.
 */
import { getMcpToolsFor } from '../../core/mcp.ts';
import type { Plugin } from '../types.ts';

export const mcpToolsPlugin: Plugin = {
  name: 'mcp-tools',
  tools: ({ mcpAllow }) => getMcpToolsFor(mcpAllow),
};
