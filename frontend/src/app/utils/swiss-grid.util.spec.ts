import { describe, expect, it } from 'vitest';
import { SWITZERLAND_BBOX } from '../config/map-bounds.config';
import {
  cellExtentToImageCoordinates,
  cellIndexToLv95,
  HECTARE_CELL_M,
  lv95ToCellIndex,
  viewportCellExtent,
} from './swiss-grid.util';

describe('swiss-grid.util', () => {
  it('round-trips LV95 cell indices', () => {
    const [x, y] = cellIndexToLv95(100, 200);
    const cell = lv95ToCellIndex(x, y);
    expect(cell).toEqual({ ix: 100, iy: 200 });
  });

  it('computes hectare extent for Zürich viewport', () => {
    const extent = viewportCellExtent(8.45, 47.32, 8.6, 47.42);
    expect(extent).not.toBeNull();
    expect(extent!.nx).toBeGreaterThan(10);
    expect(extent!.ny).toBeGreaterThan(10);
    expect(extent!.stride).toBeGreaterThanOrEqual(1);
    expect(extent!.nx).toBeLessThanOrEqual(1024);
    expect(extent!.nx * extent!.ny).toBeLessThanOrEqual(36_000);
  });

  it('uses 100 m cells', () => {
    const [x1] = cellIndexToLv95(0, 0);
    const [x2] = cellIndexToLv95(1, 0);
    expect(x2 - x1).toBe(HECTARE_CELL_M);
  });

  it('country-level map bounds yield a national overview footprint', () => {
    const extent = viewportCellExtent(5.42, 45.74, 11.03, 47.89);
    expect(extent).not.toBeNull();

    const coords = cellExtentToImageCoordinates(extent!);
    const lngSpan = Math.max(...coords.map((c) => c[0])) - Math.min(...coords.map((c) => c[0]));
    const latSpan = Math.max(...coords.map((c) => c[1])) - Math.min(...coords.map((c) => c[1]));
    expect(lngSpan + latSpan).toBeGreaterThan(3);
  });

  it('national bbox overview corners span most of Switzerland', () => {
    const extent = viewportCellExtent(
      SWITZERLAND_BBOX.west,
      SWITZERLAND_BBOX.south,
      SWITZERLAND_BBOX.east,
      SWITZERLAND_BBOX.north,
    );
    expect(extent).not.toBeNull();

    const coords = cellExtentToImageCoordinates(extent!);
    const lngSpan = Math.max(...coords.map((c) => c[0])) - Math.min(...coords.map((c) => c[0]));
    const latSpan = Math.max(...coords.map((c) => c[1])) - Math.min(...coords.map((c) => c[1]));
    expect(lngSpan + latSpan).toBeGreaterThan(3);
  });

  it('image corners span nx × stride hectare cells per axis', () => {
    const extent = viewportCellExtent(8.45, 47.32, 8.6, 47.42);
    expect(extent).not.toBeNull();

    const [centerWestX] = cellIndexToLv95(extent!.ix0, 0);
    const [centerEastX] = cellIndexToLv95(extent!.ix0 + extent!.nx * extent!.stride, 0);
    const [, centerNorthY] = cellIndexToLv95(0, extent!.iy0);

    const westX = centerWestX - HECTARE_CELL_M / 2;
    const eastX = centerEastX - HECTARE_CELL_M / 2;
    const northY = centerNorthY + HECTARE_CELL_M / 2;
    const southY = centerNorthY - extent!.ny * extent!.stride * HECTARE_CELL_M + HECTARE_CELL_M / 2;

    expect(eastX - westX).toBe(extent!.nx * extent!.stride * HECTARE_CELL_M);
    expect(northY - southY).toBe(extent!.ny * extent!.stride * HECTARE_CELL_M);

    const coords = cellExtentToImageCoordinates(extent!);
    expect(coords).toHaveLength(4);
    expect(coords[0][0]).toBeLessThan(coords[1][0]);
    expect(coords[2][1]).toBeLessThan(coords[0][1]);
  });
});
