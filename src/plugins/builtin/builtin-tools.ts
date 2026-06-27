/**
 * Built-in teammate tools (time / calculate / fetch_url) as a plugin.
 * Server-side: `tools` is assembled inside the teammate agent.
 */
import { teammateTools } from '../../shared/tools.ts';
import type { Plugin } from '../types.ts';

export const builtinToolsPlugin: Plugin = {
  name: 'builtin-tools',
  tools: () => teammateTools,
  toolNames: ['get_current_time', 'calculate', 'fetch_url'],
};
