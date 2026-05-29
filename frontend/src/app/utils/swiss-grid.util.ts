import proj4 from 'proj4';
import { SWISS_GRID_LV95_BOUNDS, SWISS_LV95_PROJ4 } from '../config/zarr-layers.config';

/** One settlement-quality raster cell = 100 m × 100 m (1 ha). */
export const HECTARE_CELL_M = 100;

const [X_MIN, Y_MIN, X_MAX, Y_MAX] = SWISS_GRID_LV95_BOUNDS;
const X0 = X_MIN + HECTARE_CELL_M / 2;
const Y0 = Y_MAX - HECTARE_CELL_M / 2;

const WGS84 = 'EPSG:4326';
const LV95 = 'CH:LV95';

proj4.defs(LV95, SWISS_LV95_PROJ4);

export const SWISS_GRID_CELL_COUNT = {
  nx: Math.round((X_MAX - X_MIN) / HECTARE_CELL_M),
  ny: Math.round((Y_MAX - Y_MIN) / HECTARE_CELL_M),
};

/** Max overview raster pixels per axis (national view ≈ 1k × 1k). */
export const MAX_OVERVIEW_AXIS_PX = 1024;

/** Max output pixels in overview composite (stride increases until under this). */
export const MAX_OVERVIEW_SAMPLE_PIXELS = 36_000;

/** Full polygon scan only for modest viewports at 100 m. */
export const POLYGON_QUERY_MAX_FULL_CELLS = 35_000;

export function wgs84ToLv95(lng: number, lat: number): [number, number] {
  const [x, y] = proj4(WGS84, LV95, [lng, lat]);
  return [x, y];
}

export function lv95ToWgs84(x: number, y: number): [number, number] {
  const [lng, lat] = proj4(LV95, WGS84, [x, y]);
  return [lng, lat];
}

export function lv95ToCellIndex(x: number, y: number): { ix: number; iy: number } | null {
  const ix = Math.round((x - X0) / HECTARE_CELL_M);
  const iy = Math.round((Y0 - y) / HECTARE_CELL_M);
  if (ix < 0 || iy < 0 || ix >= SWISS_GRID_CELL_COUNT.nx || iy >= SWISS_GRID_CELL_COUNT.ny) {
    return null;
  }
  return { ix, iy };
}

export function cellIndexToLv95(ix: number, iy: number): [number, number] {
  return [X0 + ix * HECTARE_CELL_M, Y0 - iy * HECTARE_CELL_M];
}

export function cellIndexToWgs84(ix: number, iy: number): [number, number] {
  const [x, y] = cellIndexToLv95(ix, iy);
  return lv95ToWgs84(x, y);
}

export interface ViewportCellExtent {
  ix0: number;
  iy0: number;
  ix1: number;
  iy1: number;
  /** Hectare cells spanned by viewport (before stride). */
  fullNx: number;
  fullNy: number;
  /** Output raster width in pixels (≤ MAX_OVERVIEW_AXIS_PX). */
  nx: number;
  /** Output raster height in pixels. */
  ny: number;
  /** Sample every Nth hectare cell on the 100 m index grid. */
  stride: number;
}

export function viewportCellExtent(
  west: number,
  south: number,
  east: number,
  north: number,
): ViewportCellExtent | null {
  const wgsCorners: [number, number][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
  const lv95Corners = wgsCorners.map(([lng, lat]) => wgs84ToLv95(lng, lat));

  let vx0 = Math.min(...lv95Corners.map(([x]) => x));
  let vx1 = Math.max(...lv95Corners.map(([x]) => x));
  let vy0 = Math.min(...lv95Corners.map(([, y]) => y));
  let vy1 = Math.max(...lv95Corners.map(([, y]) => y));

  const x0 = Math.max(vx0, X_MIN);
  const x1 = Math.min(vx1, X_MAX);
  const y0 = Math.max(vy0, Y_MIN);
  const y1 = Math.min(vy1, Y_MAX);

  if (x0 > x1 || y0 > y1) {
    return null;
  }

  const ix0 = Math.max(
    0,
    Math.min(
      SWISS_GRID_CELL_COUNT.nx - 1,
      Math.round((x0 - X0) / HECTARE_CELL_M),
    ),
  );
  const ix1 = Math.max(
    0,
    Math.min(
      SWISS_GRID_CELL_COUNT.nx - 1,
      Math.round((x1 - X0) / HECTARE_CELL_M),
    ),
  );
  const iy0 = Math.max(
    0,
    Math.min(
      SWISS_GRID_CELL_COUNT.ny - 1,
      Math.round((Y0 - y1) / HECTARE_CELL_M),
    ),
  );
  const iy1 = Math.max(
    0,
    Math.min(
      SWISS_GRID_CELL_COUNT.ny - 1,
      Math.round((Y0 - y0) / HECTARE_CELL_M),
    ),
  );

  if (ix1 < ix0 || iy1 < iy0) {
    return null;
  }

  const fullNx = ix1 - ix0 + 1;
  const fullNy = iy1 - iy0 + 1;

  let stride = Math.max(
    1,
    Math.ceil(Math.max(fullNx / MAX_OVERVIEW_AXIS_PX, fullNy / MAX_OVERVIEW_AXIS_PX)),
  );

  let nx = Math.ceil(fullNx / stride);
  let ny = Math.ceil(fullNy / stride);

  while (nx * ny > MAX_OVERVIEW_SAMPLE_PIXELS) {
    stride += 1;
    nx = Math.ceil(fullNx / stride);
    ny = Math.ceil(fullNy / stride);
  }

  return { ix0, iy0, ix1, iy1, fullNx, fullNy, nx, ny, stride };
}

/** Map 100 m viewport indices to tier grid indices for Zarr slice reads. */
export function tierSliceIndices(
  extent: ViewportCellExtent,
  blockFactor: number,
): { ix0: number; iy0: number; ix1: number; iy1: number } {
  if (blockFactor <= 1) {
    return { ix0: extent.ix0, iy0: extent.iy0, ix1: extent.ix1, iy1: extent.iy1 };
  }
  return {
    ix0: Math.floor(extent.ix0 / blockFactor),
    iy0: Math.floor(extent.iy0 / blockFactor),
    ix1: Math.floor(extent.ix1 / blockFactor),
    iy1: Math.floor(extent.iy1 / blockFactor),
  };
}

/**
 * MapLibre image corners for the overview raster.
 * The canvas has nx×ny pixels; each pixel represents a stride×stride block of 100 m cells.
 */
export function cellExtentToImageCoordinates(extent: ViewportCellExtent): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  const { ix0, iy0, stride, nx, ny } = extent;

  const westX = X0 + (ix0 - 0.5) * HECTARE_CELL_M;
  const eastX = X0 + (ix0 + nx * stride - 0.5) * HECTARE_CELL_M;
  const northY = Y0 - (iy0 - 0.5) * HECTARE_CELL_M;
  const southY = Y0 - (iy0 + ny * stride - 0.5) * HECTARE_CELL_M;

  const [lngW, latN] = lv95ToWgs84(westX, northY);
  const [lngE] = lv95ToWgs84(eastX, northY);
  const [, latS] = lv95ToWgs84(westX, southY);

  return [
    [lngW, latN],
    [lngE, latN],
    [lngE, latS],
    [lngW, latS],
  ];
}
