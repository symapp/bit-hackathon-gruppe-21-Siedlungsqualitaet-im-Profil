import type { Selector } from '@carbonplan/zarr-layer';
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

function bandIndex(selector: Selector | undefined): number {
  if (!selector || typeof selector !== 'object') {
    return 0;
  }
  const band = (selector as { band?: number }).band;
  return typeof band === 'number' && band >= 0 ? band : 0;
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
    pending.catch(() => {
      arrayCache.delete(cacheKey);
    });
  }
  return pending;
}

function buildSelection(
  arr: ZarrArrayHandle,
  tierIy0: number,
  tierIy1: number,
  tierIx0: number,
  tierIx1: number,
  stride: number,
  selector: Selector | undefined,
): (number | ReturnType<typeof zarr.slice>)[] {
  const ySlice =
    stride > 1
      ? zarr.slice(tierIy0, tierIy1 + 1, stride)
      : zarr.slice(tierIy0, tierIy1 + 1);
  const xSlice =
    stride > 1
      ? zarr.slice(tierIx0, tierIx1 + 1, stride)
      : zarr.slice(tierIx0, tierIx1 + 1);

  const shape = arr.shape;
  if (shape.length === 3) {
    return [bandIndex(selector), ySlice, xSlice];
  }
  if (shape.length === 2) {
    return [ySlice, xSlice];
  }
  throw new Error(`Unsupported Zarr rank ${shape.length} for overview slice`);
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
  selector: Selector | undefined,
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

  const selection = buildSelection(arr, tierIy0, tierIy1, tierIx0, tierIx1, stride, selector);
  const result = await zarr.get(arr, selection);
  if (signal?.aborted) {
    return map;
  }

  const data = result.data;
  const shape = result.shape;
  if (!data || shape.length < 2) {
    return map;
  }

  const ny = shape[shape.length - 2];
  const nx = shape[shape.length - 1];

  for (let py = 0; py < ny; py++) {
    const iy = extent.iy0 + py * stride;
    for (let px = 0; px < nx; px++) {
      const ix = extent.ix0 + px * stride;
      const raw = toNumber((data as ArrayLike<unknown>)[py * nx + px]);
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
