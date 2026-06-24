/**
 * Self-scheduling tools (roadmap step 3), bound to one channel session.
 *
 * The agent uses these to act over time: remind, follow up, chase a thread, or
 * check back later. `schedule_task` enqueues a durable future dispatch into THIS
 * channel's session; when it fires the agent is re-invoked with the instruction
 * (see `app.ts` / `scheduler.ts`).
 */
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { cancelTask, listTasks, scheduleTask } from '../core/scheduler.ts';

export function createScheduleTools(sessionId: string) {
  const schedule_task = defineTool({
    name: 'schedule_task',
    description:
      'Schedule yourself to do something later in THIS channel. Give either delay_seconds or at (ISO 8601, UTC). ' +
      'When the time comes you are re-invoked with the instruction and should carry it out and post the result here.',
    input: v.object({
      instruction: v.pipe(
        v.string(),
        v.minLength(1),
        v.description('What to do when the task fires, written as an instruction to your future self.'),
      ),
      delay_seconds: v.optional(
        v.pipe(v.number(), v.minValue(1), v.description('Run this many seconds from now.')),
      ),
      at: v.optional(v.pipe(v.string(), v.description('ISO 8601 timestamp (UTC) to run at.'))),
    }),
    output: v.object({ id: v.string(), runAt: v.string() }),
    async run({ input }) {
      let runAtMs: number;
      if (input.delay_seconds != null) {
        runAtMs = Date.now() + input.delay_seconds * 1000;
      } else if (input.at) {
        runAtMs = Date.parse(input.at);
        if (Number.isNaN(runAtMs)) throw new Error('`at` is not a valid ISO 8601 timestamp.');
      } else {
        throw new Error('Provide either delay_seconds or at.');
      }
      if (runAtMs <= Date.now()) throw new Error('Scheduled time must be in the future.');

      const task = scheduleTask({
        sessionId,
        runAt: new Date(runAtMs).toISOString(),
        instruction: input.instruction,
      });
      return { id: task.id, runAt: task.runAt };
    },
  });

  const list_scheduled_tasks = defineTool({
    name: 'list_scheduled_tasks',
    description: 'List the tasks you have scheduled for this channel that have not fired yet.',
    output: v.object({
      tasks: v.array(v.object({ id: v.string(), runAt: v.string(), instruction: v.string() })),
    }),
    async run() {
      return {
        tasks: listTasks(sessionId).map((task) => ({
          id: task.id,
          runAt: task.runAt,
          instruction: task.instruction,
        })),
      };
    },
  });

  const cancel_scheduled_task = defineTool({
    name: 'cancel_scheduled_task',
    description: 'Cancel a scheduled task by id (from list_scheduled_tasks).',
    input: v.object({ id: v.string() }),
    output: v.object({ cancelled: v.boolean() }),
    async run({ input }) {
      return { cancelled: cancelTask(sessionId, input.id) };
    },
  });

  return [schedule_task, list_scheduled_tasks, cancel_scheduled_task];
}
