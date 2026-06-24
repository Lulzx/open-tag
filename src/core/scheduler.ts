/**
 * Durable self-scheduling (roadmap step 3).
 *
 * Flue owns the agent loop and durable session state; it does not prescribe a
 * scheduler (Schedules guide). So this is the thin wiring: persist pending
 * tasks, re-arm timers on startup, and `dispatch(...)` the instruction into the
 * channel's continuing agent session when due. The dispatched turn's output
 * reaches the channel through the bot's SessionMirror tail.
 *
 * Runs in the Flue server process (initialized from `app.ts`). The same module
 * singleton backs both startup re-arming and the schedule_task tool.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dispatch } from '@flue/runtime';
import { TEAMMATE_AGENT } from '../shared/constants.ts';

/** Dispatched input type the agent recognizes as "a scheduled task came due". */
export const SCHEDULED_TASK_INPUT = 'open-tag.scheduled_task';

const MAX_TIMEOUT_MS = 2_147_483_647; // setTimeout's 32-bit ceiling (~24.8 days).

export interface ScheduledTask {
  id: string;
  sessionId: string;
  runAt: string; // ISO 8601
  instruction: string;
  createdAt: string;
}

const storePath = process.env.OPEN_TAG_SCHEDULE_PATH ?? './data/schedules.json';
const tasks = new Map<string, ScheduledTask>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let initialized = false;

function load(): void {
  try {
    if (!existsSync(storePath)) return;
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as ScheduledTask[];
    for (const task of parsed) tasks.set(task.id, task);
  } catch (err) {
    console.error('[scheduler] load failed:', err);
  }
}

function persist(): void {
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify([...tasks.values()], null, 2));
  } catch (err) {
    console.error('[scheduler] persist failed:', err);
  }
}

function arm(task: ScheduledTask): void {
  const remaining = new Date(task.runAt).getTime() - Date.now();
  const timer = setTimeout(() => void fire(task.id), Math.min(Math.max(0, remaining), MAX_TIMEOUT_MS));
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(task.id, timer);
}

async function fire(id: string): Promise<void> {
  const task = tasks.get(id);
  if (!task) return;
  // Long delays are capped above; re-arm if the real due time hasn't arrived.
  if (new Date(task.runAt).getTime() - Date.now() > 1000) {
    arm(task);
    return;
  }
  try {
    await dispatch({
      agent: TEAMMATE_AGENT,
      id: task.sessionId,
      input: { type: SCHEDULED_TASK_INPUT, instruction: task.instruction, scheduledAt: task.runAt },
    });
  } catch (err) {
    console.error('[scheduler] dispatch failed:', err);
  }
  remove(id);
}

function remove(id: string): void {
  tasks.delete(id);
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  persist();
}

/** Load persisted tasks and re-arm their timers. Call once at server startup. */
export function initScheduler(): void {
  if (initialized) return;
  initialized = true;
  load();
  for (const task of tasks.values()) arm(task);
  if (tasks.size > 0) console.log(`[scheduler] re-armed ${tasks.size} pending task(s)`);
}

export function scheduleTask(args: { sessionId: string; runAt: string; instruction: string }): ScheduledTask {
  const task: ScheduledTask = {
    id: randomUUID(),
    sessionId: args.sessionId,
    runAt: args.runAt,
    instruction: args.instruction,
    createdAt: new Date().toISOString(),
  };
  tasks.set(task.id, task);
  persist();
  arm(task);
  return task;
}

export function listTasks(sessionId: string): ScheduledTask[] {
  return [...tasks.values()].filter((task) => task.sessionId === sessionId);
}

export function cancelTask(sessionId: string, id: string): boolean {
  const task = tasks.get(id);
  if (!task || task.sessionId !== sessionId) return false;
  remove(id);
  return true;
}
