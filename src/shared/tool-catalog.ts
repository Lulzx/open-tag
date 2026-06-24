/**
 * Names of the built-in teammate tools, for the bot's `tools` admin command
 * (listing and validating allow/deny). Kept in sync with the tool factories in
 * shared/tools.ts, shared/schedule-tools.ts, and shared/memory-tools.ts.
 *
 * Enforcement filters by actual tool `.name` at agent init (agents/teammate.ts);
 * this catalog is only the human-facing list the bot shows and checks against.
 */
export const TOOL_CATALOG: string[] = [
  'get_current_time',
  'calculate',
  'fetch_url',
  'schedule_task',
  'list_scheduled_tasks',
  'cancel_scheduled_task',
  'remember_fact',
  'list_facts',
  'forget_fact',
];
