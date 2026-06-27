/**
 * Per-channel MCP connector admin: `mcp` / `mcp allow|deny <server>` /
 * `mcp reset`. Lists/validates against the configured MCP servers.
 */
import { allowMcp, denyMcp, getPolicy, resetMcp } from '../../core/policy.ts';
import { mcpServerNames } from '../../shared/mcp-config.ts';
import type { ParsedCommand, Plugin } from '../types.ts';

function parse(text: string): ParsedCommand | null {
  const t = text.trim();
  if (/^mcp$/i.test(t)) {
    return {
      mutating: false,
      run: (ctx) => {
        const allowed = new Set(getPolicy(ctx.sessionId).mcpAllow);
        const servers = mcpServerNames();
        if (servers.length === 0) return 'No MCP servers are configured (set OPEN_TAG_MCP_SERVERS).';
        const lines = servers.map((name) => `${allowed.has(name) ? '✅' : '🚫'} ${name}`);
        return ['MCP connectors for this channel (default off):', ...lines].join('\n');
      },
    };
  }
  if (/^mcp\s+reset$/i.test(t)) {
    return {
      mutating: true,
      run: (ctx) => {
        resetMcp(ctx.sessionId);
        return 'All MCP connectors disabled for this channel. Applies to new turns.';
      },
    };
  }
  const allow = /^mcp\s+allow\s+(\S+)$/i.exec(t);
  if (allow) {
    const name = allow[1];
    return {
      mutating: true,
      run: (ctx) => {
        allowMcp(ctx.sessionId, name);
        const known = mcpServerNames().includes(name) ? '' : ' (note: not a configured server)';
        return `Enabled MCP server \`${name}\`${known} for this channel. Applies to new turns.`;
      },
    };
  }
  const deny = /^mcp\s+deny\s+(\S+)$/i.exec(t);
  if (deny) {
    const name = deny[1];
    return {
      mutating: true,
      run: (ctx) => {
        denyMcp(ctx.sessionId, name);
        return `Disabled MCP server \`${name}\` for this channel. Applies to new turns.`;
      },
    };
  }
  return null;
}

export const mcpAdminPlugin: Plugin = {
  name: 'mcp-admin',
  commands: [
    {
      name: 'mcp',
      help: '• `mcp` / `mcp allow <server>` / `mcp deny <server>` / `mcp reset` — per-channel MCP connectors',
      parse,
    },
  ],
  describe: (ctx) => {
    const { mcpAllow } = getPolicy(ctx.sessionId);
    return `• MCP connectors: ${mcpAllow.length > 0 ? mcpAllow.join(', ') : 'none'}`;
  },
};
