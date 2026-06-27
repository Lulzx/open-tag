/**
 * Per-channel memory tools as a plugin (remember/list/forget + dynamic recall).
 *
 * `recall_context` is added dynamically by `createMemoryTools` only when a
 * vector store is configured, so it is intentionally absent from `toolNames` —
 * the RBAC catalog lists only the always-present tools, matching prior behavior.
 */
import { createMemoryTools } from '../../shared/memory-tools.ts';
import type { Plugin } from '../types.ts';

export const memoryPlugin: Plugin = {
  name: 'memory',
  tools: ({ sessionId }) => createMemoryTools(sessionId),
  toolNames: ['remember_fact', 'list_facts', 'forget_fact'],
};
