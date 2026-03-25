/**
 * In-memory circular-buffer dedup.
 * Keeps last N event IDs to prevent re-delivery.
 * O(1) add/check via Set + circular index (no Array.shift overhead).
 */

export class Dedup {
  private readonly ring: (string | undefined)[];
  private readonly seen = new Set<string>();
  private readonly maxSize: number;
  private writeIdx = 0;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
    this.ring = new Array(maxSize);
  }

  isDuplicate(id: string): boolean {
    return this.seen.has(id);
  }

  add(id: string): void {
    if (this.seen.has(id)) return;

    // Evict the oldest entry at the write position
    const evicted = this.ring[this.writeIdx];
    if (evicted !== undefined) {
      this.seen.delete(evicted);
    }

    this.ring[this.writeIdx] = id;
    this.seen.add(id);
    this.writeIdx = (this.writeIdx + 1) % this.maxSize;
  }
}
