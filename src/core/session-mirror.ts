/**
 * SessionMirror — mirrors a channel's shared agent session to the channel.
 *
 * It keeps ONE persistent live tail of the agent instance's event stream and
 * renders every assistant turn to the channel, regardless of what triggered it:
 * a user @mention, a self-scheduled task firing (step 3), or an ambient nudge
 * (step 4). That single tail is what lets the agent speak proactively — output
 * is not tied to a request/response the bot is actively awaiting.
 *
 * User input is submitted fire-and-forget via `agents.send`; the tail handles
 * all rendering. Flue serializes submissions per instance, so turns never race.
 */
import { index } from './recall.ts';
import { StreamRenderer } from './renderer.ts';
import { AGENT_NAME, teammateClient } from './teammate-client.ts';
import type { PlatformAdapter } from '../platform/types.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface SessionMirrorOpts {
  /** Resume tailing from this offset (catch up output produced while offline). */
  startOffset?: string;
  /** Called as the durable resume checkpoint advances, so it can be persisted. */
  onOffset?: (offset: string) => void;
}

export class SessionMirror {
  private readonly adapter: PlatformAdapter;
  private readonly channelId: string;
  private readonly sessionId: string;
  private readonly opts: SessionMirrorOpts;

  private started = false;
  private stopped = false;
  private active: StreamRenderer | null = null;
  private acc = '';
  private pendingReplyTo?: string;

  constructor(adapter: PlatformAdapter, channelId: string, sessionId: string, opts: SessionMirrorOpts = {}) {
    this.adapter = adapter;
    this.channelId = channelId;
    this.sessionId = sessionId;
    this.opts = opts;
  }

  /** Submit a user message to the shared session; ensures the tail is running. */
  async submit(message: string, replyTo?: string): Promise<void> {
    this.pendingReplyTo = replyTo;
    const { offset } = await teammateClient.agents.send(AGENT_NAME, this.sessionId, { message });
    this.ensureStarted(offset);
  }

  /** Start tailing without submitting (resume known channels after a restart). */
  resume(): void {
    this.ensureStarted('now');
  }

  stop(): void {
    this.stopped = true;
  }

  private ensureStarted(fallbackOffset: string): void {
    if (this.started) return;
    this.started = true;
    void this.loop(this.opts.startOffset ?? fallbackOffset);
  }

  private async loop(offset: string): Promise<void> {
    while (!this.stopped) {
      try {
        const stream = teammateClient.agents.stream(AGENT_NAME, this.sessionId, { offset, live: true });
        for await (const event of stream) {
          if (this.stopped) break;
          await this.onEvent(event);
          offset = stream.offset;
          this.opts.onOffset?.(offset);
        }
      } catch (err) {
        if (this.stopped) return;
        console.error(`[mirror ${this.sessionId}] stream error; retrying in 3s:`, err);
        await delay(3000);
      }
    }
  }

  private async onEvent(event: { type: string; [k: string]: unknown }): Promise<void> {
    switch (event.type) {
      case 'text_delta': {
        const renderer = await this.ensureRenderer();
        this.acc += String(event.text ?? '');
        renderer.push(this.acc);
        break;
      }
      case 'tool_start': {
        const renderer = await this.ensureRenderer();
        renderer.setNote(`🔧 ${String(event.toolName ?? 'tool')}…`);
        break;
      }
      case 'submission_settled': {
        if (event.outcome === 'failed' && this.active) {
          const err = event.error as { message?: string } | undefined;
          await this.active.fail(new Error(err?.message ?? 'agent run failed'));
          this.reset();
        }
        break;
      }
      case 'idle': {
        if (this.active) {
          const reply = this.acc;
          await this.active.finish();
          this.reset();
          // Record the agent's reply for semantic recall (no-op unless enabled).
          if (reply.trim().length >= 12) void index(this.sessionId, 'assistant', reply);
        }
        break;
      }
    }
  }

  private async ensureRenderer(): Promise<StreamRenderer> {
    if (!this.active) {
      const renderer = new StreamRenderer(
        this.adapter,
        this.channelId,
        this.pendingReplyTo ? { replyTo: this.pendingReplyTo } : {},
      );
      this.pendingReplyTo = undefined;
      await renderer.open();
      this.active = renderer;
      this.acc = '';
    }
    return this.active;
  }

  private reset(): void {
    this.active = null;
    this.acc = '';
  }
}
