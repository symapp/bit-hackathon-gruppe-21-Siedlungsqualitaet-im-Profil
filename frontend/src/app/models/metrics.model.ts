export interface LocationMetrics {
  tranquillityIndex: number | null;
  populationDensityPerKm2: number | null;
  publicTransportAccessibility: number | null;
  roadAccessibility: number | null;
  publicTransportQuality: number | null;
  publicTransportTravelTimeMin: number | null;
  roadTravelTimeMin: number | null;
  railTrafficLoad: number | null;
  roadTrafficLoad: number | null;
  secondaryHomesRatePct: number | null;
  landscapeTypeId: number | null;
  solarSuitability: number | null;
  inAgglomeration: number | null;
}

export const EMPTY_LOCATION_METRICS: LocationMetrics = {
  tranquillityIndex: null,
  populationDensityPerKm2: null,
  publicTransportAccessibility: null,
  roadAccessibility: null,
  publicTransportQuality: null,
  publicTransportTravelTimeMin: null,
  roadTravelTimeMin: null,
  railTrafficLoad: null,
  roadTrafficLoad: null,
  secondaryHomesRatePct: null,
  landscapeTypeId: null,
  solarSuitability: null,
  inAgglomeration: null,
};
