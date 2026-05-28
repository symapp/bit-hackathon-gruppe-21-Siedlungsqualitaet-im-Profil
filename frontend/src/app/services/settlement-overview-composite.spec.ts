import { describe, expect, it } from 'vitest';
import type { ZarrLayerDefinition } from '../config/zarr-layers.config';
import type { LayerPreference } from '../models/layer-preference.model';
import { fetchOverviewRawMaps, preferencesFingerprint } from './settlement-overview-composite';
import { OverviewRawCache } from './overview-raw-cache';
import type { ViewportCellExtent } from '../utils/swiss-grid.util';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const extent: ViewportCellExtent = {
  ix0: 0,
  iy0: 0,
  ix1: 2,
  iy1: 2,
  fullNx: 3,
  fullNy: 3,
  nx: 3,
  ny: 3,
  stride: 1,
};

const definition: ZarrLayerDefinition = {
  id: 'test-layer',
  label: 'Test',
  description: '',
  storePath: 'https://example.com/test.zarr',
  variable: 'v',
  bounds: [0, 0, 1, 1],
  latIsAscending: false,
  colormap: ['#000', '#fff'],
  clim: [0, 100],
  metricKey: 'tranquillityIndex',
  metricLabel: 'T',
  metricUnit: '',
  formatValue: (v) => String(v),
  higherIsBetter: true,
};

const pref: LayerPreference = {
  enabled: true,
  importance: 100,
  rangeMin: 0,
  rangeMax: 1,
  falloffLeft: 0.1,
  falloffRight: 0.1,
};

const plan = { tier: 'L100' as const, readMode: 'index_slice' as const, cellM: 100 as const, blockFactor: 1 };

describe('fetchOverviewRawMaps cache', () => {
  it('returns cached map without network', async () => {
    const cache = new OverviewRawCache(8);
    const key = OverviewRawCache.rawKey('L100', definition.id, 0, 0, 2, 2, 1);
    cache.set(key, new Map([['0,0', 42]]));

    const rawMaps = await fetchOverviewRawMaps(
      {
        sources: [{ definition, ready: true, queryContext: { definition, layer: {} as never, plan } }],
        preferences: { [definition.id]: pref },
        metaByLayerId: {},
        west: 8.5,
        south: 47.3,
        east: 8.6,
        north: 47.4,
        zoom: 10,
        plan,
        rawCache: cache,
      },
      extent,
    );

    expect(rawMaps.get(definition.id)?.get('0,0')).toBe(42);
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(0);
  });
});

describe('preferencesFingerprint', () => {
  it('changes when trapezoid changes', () => {
    const ids = ['a'];
    const f1 = preferencesFingerprint({ a: pref }, ids);
    const f2 = preferencesFingerprint({ a: { ...pref, rangeMin: 0.2 } }, ids);
    expect(f1).not.toBe(f2);
  });
});

describe('no strided point query regression', () => {
  it('does not reference queryStridedCellMap in src', () => {
    const srcRoot = join(process.cwd(), 'src/app');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
        } else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) {
          files.push(p);
        }
      }
    };
    walk(srcRoot);
    const hits = files.filter((f) => readFileSync(f, 'utf8').includes('queryStridedCellMap'));
    expect(hits).toEqual([]);
  });
});
