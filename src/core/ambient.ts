/**
 * Ambient triage (roadmap step 4).
 *
 * A cheap "should I act?" gate for messages the bot was NOT addressed in.
 * DESIGN.md allows "a small model or rules"; this is the rules path — fast, free
 * and conservative, so ambient mode stays quiet by default. It is intentionally
 * pluggable: a model-backed classifier can replace `shouldChimeIn` later without
 * touching the runtime. Combined with the per-channel opt-in and a rate limiter,
 * this is what keeps ambient mode from being noisy.
 */

// Clear signals that the room is asking for help and might want the teammate.
const TRIGGERS: RegExp[] = [
  /\?\s*$/, // ends with a question mark
  /\b(how|what|why|where|when|which|who)\b[^?]*\?/i, // a wh-question
  /\b(anyone|someone|somebody)\b.*\b(know|have|seen|tried|help)\b/i,
  /\b(can|could|would)\s+(someone|anyone|somebody)\b/i,
  /\b(help|stuck|blocked|broken|failing|error|can'?t figure)\b/i,
  /\b(todo|remind me|follow ?up|don'?t forget|action item)\b/i,
];

/** True when an overheard message looks like the channel could use a hand. */
export function shouldChimeIn(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false; // ignore reactions, "ok", emoji, etc.
  return TRIGGERS.some((re) => re.test(trimmed));
}

/** Sliding-window rate limiter, keyed (e.g. per channel). */
export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly hits = new Map<string, number[]>();

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Record an attempt; returns false (and records nothing) when over budget. */
  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
