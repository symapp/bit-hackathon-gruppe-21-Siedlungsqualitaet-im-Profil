/** Official Switzerland WGS84 bbox (swisstopo). */
export const SWITZERLAND_BBOX = {
  west: 5.9559,
  south: 45.8179,
  east: 10.4921,
  north: 47.8084,
} as const;

/** Extra degrees around CH bbox so maxBounds still allows country-wide view with UI chrome. */
const MAP_PADDING_DEG = 3.5;

/** Padded bounds for map pan/zoom (maxBounds). */
export const SWITZERLAND_MAX_BOUNDS: [[number, number], [number, number]] = [
  [SWITZERLAND_BBOX.west - MAP_PADDING_DEG, SWITZERLAND_BBOX.south - MAP_PADDING_DEG],
  [SWITZERLAND_BBOX.east + MAP_PADDING_DEG, SWITZERLAND_BBOX.north + MAP_PADDING_DEG],
];

export function clampToSwitzerland(lng: number, lat: number): { lng: number; lat: number } {
  return {
    lng: Math.min(Math.max(lng, SWITZERLAND_BBOX.west), SWITZERLAND_BBOX.east),
    lat: Math.min(Math.max(lat, SWITZERLAND_BBOX.south), SWITZERLAND_BBOX.north),
  };
}
