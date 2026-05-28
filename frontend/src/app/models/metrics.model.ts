export interface LocationMetrics {
  tranquillityIndex: number | null;
  populationDensityPerKm2: number | null;
  publicTransportAccessibility: number | null;
}

export const EMPTY_LOCATION_METRICS: LocationMetrics = {
  tranquillityIndex: null,
  populationDensityPerKm2: null,
  publicTransportAccessibility: null,
};
