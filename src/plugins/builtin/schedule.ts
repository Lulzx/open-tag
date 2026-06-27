/**
 * Self-scheduling tools + the scheduler's startup re-arm, as a plugin.
 * `onServerStart` runs in the Flue server (app.ts); the tools are bound per
 * channel session at agent init.
 */
import { initScheduler } from '../../core/scheduler.ts';
import { createScheduleTools } from '../../shared/schedule-tools.ts';
import type { Plugin } from '../types.ts';

export const schedulePlugin: Plugin = {
  name: 'schedule',
  tools: ({ sessionId }) => createScheduleTools(sessionId),
  toolNames: ['schedule_task', 'list_scheduled_tasks', 'cancel_scheduled_task'],
  lifecycle: {
    onServerStart: () => initScheduler(),
  },
};
