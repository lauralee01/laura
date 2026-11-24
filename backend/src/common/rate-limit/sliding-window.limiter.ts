/**
 * Tiny in-memory sliding-window limiter (per process).
 * Good enough to stop one session from hammering a third-party API;
 * not a substitute for a shared limiter if the backend is scaled out.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit and returns true if it is within the limit. */
  tryConsume(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (recent.length >= this.maxHits) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);

    if (this.hits.size > 5_000) {
      this.prune(cutoff);
    }
    return true;
  }

  private prune(cutoff: number): void {
    for (const [key, times] of this.hits) {
      if (!times.some((t) => t > cutoff)) {
        this.hits.delete(key);
      }
    }
  }
}
