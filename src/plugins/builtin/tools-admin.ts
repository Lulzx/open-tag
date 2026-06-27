/**
 * Tool RBAC admin: `tools` / `tools allow|deny <name>` / `tools reset`.
 * Lists/validates against the composed plugin tool catalog.
 */
import { allowTool, denyTool, getPolicy, resetTools } from '../../core/policy.ts';
import { toolCatalog } from '../collect.ts';
import type { ParsedCommand, Plugin } from '../types.ts';

function parse(text: string): ParsedCommand | null {
  const t = text.trim();
  if (/^tools$/i.test(t)) {
    return {
      mutating: false,
      run: (ctx) => {
        const denied = new Set(getPolicy(ctx.sessionId).toolDeny);
        const lines = toolCatalog().map((name) => `${denied.has(name) ? '🚫' : '✅'} ${name}`);
        return ['Tools for this channel:', ...lines].join('\n');
      },
    };
  }
  if (/^tools\s+reset$/i.test(t)) {
    return {
      mutating: true,
      run: (ctx) => {
        resetTools(ctx.sessionId);
        return 'All tools re-enabled for this channel. Applies to new turns.';
      },
    };
  }
  const allow = /^tools\s+allow\s+(\S+)$/i.exec(t);
  if (allow) {
    const name = allow[1];
    return {
      mutating: true,
      run: (ctx) => {
        allowTool(ctx.sessionId, name);
        return `Enabled \`${name}\`. Applies to new turns.`;
      },
    };
  }
  const deny = /^tools\s+deny\s+(\S+)$/i.exec(t);
  if (deny) {
    const name = deny[1];
    return {
      mutating: true,
      run: (ctx) => {
        denyTool(ctx.sessionId, name);
        const known = toolCatalog().includes(name) ? '' : ' (note: not a known tool name)';
        return `Disabled \`${name}\`${known} for this channel. Applies to new turns.`;
      },
    };
  }
  return null;
}

export const toolsAdminPlugin: Plugin = {
  name: 'tools-admin',
  commands: [
    {
      name: 'tools',
      help: '• `tools` / `tools deny <name>` / `tools allow <name>` / `tools reset` — control my tools',
      parse,
    },
  ],
  describe: (ctx) => {
    const { toolDeny } = getPolicy(ctx.sessionId);
    return `• disabled tools: ${toolDeny.length > 0 ? toolDeny.join(', ') : 'none'}`;
  },
};
