/**
 * The plugin manifest — the ONE place that lists what the teammate can do.
 *
 * Array order is significant: it is the command-resolution order (first matching
 * `parse` wins) and the order of composed `help`, `settings`, and tool-catalog
 * output. Adding a feature is a new file here plus one entry — no edits to the
 * runtime, the agent, or the launcher.
 *
 * Imported by both processes; each reads only its slice (see collect.ts).
 */
import { ambientPlugin } from './builtin/ambient.ts';
import { builtinToolsPlugin } from './builtin/builtin-tools.ts';
import { helpPlugin } from './builtin/help.ts';
import { mcpAdminPlugin } from './builtin/mcp-admin.ts';
import { mcpToolsPlugin } from './builtin/mcp-tools.ts';
import { memoryPlugin } from './builtin/memory.ts';
import { modelPlugin } from './builtin/model.ts';
import { reactAckPlugin } from './builtin/react-ack.ts';
import { recallPlugin } from './builtin/recall.ts';
import { schedulePlugin } from './builtin/schedule.ts';
import { settingsPlugin } from './builtin/settings.ts';
import { toolsAdminPlugin } from './builtin/tools-admin.ts';
import type { Plugin } from './types.ts';

export const plugins: Plugin[] = [
  // Commands (resolution + help/settings order)
  helpPlugin,
  settingsPlugin,
  ambientPlugin,
  modelPlugin,
  toolsAdminPlugin,
  mcpAdminPlugin,
  // Message hooks
  recallPlugin,
  reactAckPlugin,
  // Tools + lifecycle (catalog order: builtin → schedule → memory → mcp)
  builtinToolsPlugin,
  schedulePlugin,
  memoryPlugin,
  mcpToolsPlugin,
];
