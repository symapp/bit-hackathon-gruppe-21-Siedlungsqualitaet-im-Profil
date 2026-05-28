/** LRU cache for overview raw cell maps (no preferences in key). */

export interface OverviewRawCacheStats {
  hits: number;
  misses: number;
  size: number;
}

export class OverviewRawCache {
  private readonly maxEntries: number;
  private readonly map = new Map<string, Map<string, number>>();
  private hits = 0;
  private misses = 0;

  constructor(maxEntries = 32) {
    this.maxEntries = maxEntries;
  }

  static rawKey(
    tier: string,
    layerId: string,
    ix0: number,
    iy0: number,
    ix1: number,
    iy1: number,
    stride: number,
  ): string {
    return `overviewRaw:v1:${tier}:${layerId}:${ix0},${iy0},${ix1},${iy1},${stride}`;
  }

  get(key: string): Map<string, number> | undefined {
    const value = this.map.get(key);
    if (!value) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: Map<string, number>): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
  }

  deleteLayer(layerId: string): void {
    for (const key of [...this.map.keys()]) {
      if (key.includes(`:${layerId}:`)) {
        this.map.delete(key);
      }
    }
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats(): OverviewRawCacheStats {
    return { hits: this.hits, misses: this.misses, size: this.map.size };
  }
}
