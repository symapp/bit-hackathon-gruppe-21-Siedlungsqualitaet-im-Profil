import { describe, expect, it } from 'vitest';
import { OverviewRawCache } from './overview-raw-cache';

describe('OverviewRawCache', () => {
  it('returns cached map on hit', () => {
    const cache = new OverviewRawCache(4);
    const key = OverviewRawCache.rawKey('L100', 'a', 0, 0, 10, 10, 1);
    const map = new Map([['0,0', 1]]);
    cache.set(key, map);
    expect(cache.get(key)).toBe(map);
    expect(cache.stats().hits).toBe(1);
  });

  it('evicts oldest when over capacity', () => {
    const cache = new OverviewRawCache(2);
    cache.set('a', new Map());
    cache.set('b', new Map());
    cache.set('c', new Map());
    expect(cache.stats().size).toBe(2);
    expect(cache.get('a')).toBeUndefined();
  });

  it('key does not include preference fields', () => {
    const k1 = OverviewRawCache.rawKey('L500', 'tranquillity', 1, 2, 3, 4, 2);
    const k2 = OverviewRawCache.rawKey('L500', 'tranquillity', 1, 2, 3, 4, 2);
    expect(k1).toBe(k2);
  });
});
