import * as zarr from 'zarrita';
import type { ViewportCellExtent } from '../utils/swiss-grid.util';
import { tierSliceIndices } from '../utils/swiss-grid.util';

type ZarrArrayHandle = zarr.Array<zarr.DataType, zarr.FetchStore>;

const arrayCache = new Map<string, Promise<ZarrArrayHandle>>();

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return null;
}

async function openVariableArray(storePath: string, variable: string): Promise<ZarrArrayHandle> {
  const cacheKey = `${storePath}::${variable}`;
  let pending = arrayCache.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const store = new zarr.FetchStore(storePath);
      const root = await zarr.open(store, { kind: 'group' });
      const node = root.resolve(variable);
      const opened = await zarr.open(node, { kind: 'array' });
      if (opened.kind !== 'array') {
        throw new Error(`Expected Zarr array at ${variable}`);
      }
      return opened;
    })();
    arrayCache.set(cacheKey, pending);
  }
  return pending;
}

/**
 * Chunk-aligned read of a rectangular window; keys use 100 m master indices aligned
 * with `scoreOverviewComposite` lookups (`extent.ix0 + px * stride`).
 */
export async function queryCellWindowByIndex(
  storePath: string,
  variable: string,
  extent: ViewportCellExtent,
  blockFactor: number,
  stride: number,
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (signal?.aborted) {
    return map;
  }

  const tier = tierSliceIndices(extent, blockFactor);
  const { ix0: tierIx0, iy0: tierIy0, ix1: tierIx1, iy1: tierIy1 } = tier;

  const arr = await openVariableArray(storePath, variable);
  if (signal?.aborted) {
    return map;
  }

  const result = await zarr.get(arr, [
    zarr.slice(tierIy0, tierIy1 + 1),
    zarr.slice(tierIx0, tierIx1 + 1),
  ]);
  if (signal?.aborted) {
    return map;
  }

  const data = result.data;
  const shape = result.shape;
  if (!data || shape.length < 2) {
    return map;
  }

  const tierNy = shape[0];
  const tierNx = shape[1];

  for (let py = 0; py < extent.ny; py++) {
    const iy = extent.iy0 + py * stride;
    const iyTier = Math.floor(iy / blockFactor) - tierIy0;
    if (iyTier < 0 || iyTier >= tierNy) {
      continue;
    }
    for (let px = 0; px < extent.nx; px++) {
      const ix = extent.ix0 + px * stride;
      const ixTier = Math.floor(ix / blockFactor) - tierIx0;
      if (ixTier < 0 || ixTier >= tierNx) {
        continue;
      }
      const flat = data as ArrayLike<unknown>;
      const raw = toNumber(flat[iyTier * tierNx + ixTier]);
      if (raw !== null) {
        map.set(`${ix},${iy}`, raw);
      }
    }
  }

  return map;
}

/** @internal test helper */
export function clearOverviewZarrArrayCache(): void {
  arrayCache.clear();
}
