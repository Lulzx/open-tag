/**
 * StreamRenderer — turns a stream of growing text into throttled edit-in-place
 * updates on a platform message (DESIGN.md §4.2).
 *
 * The agent emits progressive output; we can't edit a chat message on every
 * token (Telegram allows ~1 edit/sec). So we coalesce: keep the latest full
 * text, flush at most once per `minEditMs`, and always flush the final state.
 * Overflow past `maxMessageLen` spills into follow-up messages.
 */
import type { MessageHandle, OutboundContent, PlatformAdapter, SendOpts } from '../platform/types.ts';

const PLACEHOLDER = '…';

export class StreamRenderer {
  private head: MessageHandle | null = null;
  private overflow: MessageHandle[] = [];
  private latest = '';
  private rendered = '';
  private note = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastEditAt = 0;
  private flushing = false;

  private readonly adapter: PlatformAdapter;
  private readonly channelId: string;
  private readonly opts: { replyTo?: string; minEditMs?: number };

  constructor(
    adapter: PlatformAdapter,
    channelId: string,
    opts: { replyTo?: string; minEditMs?: number } = {},
  ) {
    this.adapter = adapter;
    this.channelId = channelId;
    this.opts = opts;
  }

  private get minEditMs(): number {
    return this.opts.minEditMs ?? 1200;
  }

  private get maxLen(): number {
    return this.adapter.caps.maxMessageLen;
  }

  /** Post the initial placeholder so the channel sees the bot is working. */
  async open(): Promise<void> {
    const sendOpts: SendOpts | undefined = this.opts.replyTo ? { replyTo: this.opts.replyTo } : undefined;
    this.head = await this.adapter.send(this.channelId, { text: PLACEHOLDER }, sendOpts);
    await this.adapter.react?.(this.head, '👀');
  }

  /** A transient status line (e.g. a tool call) shown until real text arrives. */
  setNote(note: string): void {
    this.note = note;
    if (!this.latest) this.schedule();
  }

  /** Push the full accumulated text so far. */
  push(fullText: string): void {
    this.latest = fullText;
    this.schedule();
  }

  /** Flush the final text and cancel any pending throttled edit. */
  async finish(fullText?: string): Promise<void> {
    if (fullText !== undefined) this.latest = fullText;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.note = '';
    await this.flush(true);
  }

  /** Report a failure in place of the answer. */
  async fail(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.latest = `⚠️ Something went wrong: ${message}`;
    await this.finish();
  }

  private displayText(): string {
    if (this.latest) return this.latest;
    if (this.note) return this.note;
    return PLACEHOLDER;
  }

  private schedule(): void {
    if (this.timer || this.flushing) return;
    const wait = Math.max(0, this.minEditMs - (Date.now() - this.lastEditAt));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush(false);
    }, wait);
  }

  private async flush(final: boolean): Promise<void> {
    if (!this.head || this.flushing) return;
    const text = this.displayText();
    if (text === this.rendered) return;
    this.flushing = true;
    try {
      await this.renderText(text);
      this.rendered = text;
      this.lastEditAt = Date.now();
    } catch (err) {
      // "message is not modified" and rate-limit races are non-fatal; drop them.
      if (!isIgnorableEditError(err)) console.error('[renderer] edit failed:', err);
    } finally {
      this.flushing = false;
    }
    // New text may have arrived while we were awaiting the edit.
    if (!final && this.displayText() !== this.rendered) this.schedule();
  }

  /** Write `text` across the head message plus overflow follow-ups. */
  private async renderText(text: string): Promise<void> {
    const chunks = chunk(text, this.maxLen);
    const content: OutboundContent = { text: chunks[0] ?? PLACEHOLDER };
    await this.adapter.edit(this.head!, content);

    for (let i = 1; i < chunks.length; i++) {
      const existing = this.overflow[i - 1];
      if (existing) {
        await this.adapter.edit(existing, { text: chunks[i] });
      } else {
        this.overflow[i - 1] = await this.adapter.send(this.channelId, { text: chunks[i] });
      }
    }
  }
}

/** Split on paragraph/line/space boundaries when possible, hard-cut otherwise. */
function chunk(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const cut = breakAt > max * 0.5 ? breakAt : max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function isIgnorableEditError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /not modified|message is not modified|429|too many requests/i.test(message);
}
