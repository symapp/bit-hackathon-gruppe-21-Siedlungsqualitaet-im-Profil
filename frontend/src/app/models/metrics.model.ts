export interface LocationMetrics {
  temperatureCelsius: number | null;
  tranquillityIndex: number | null;
  populationDensityPerKm2: number | null;
  vacancyRatePercent: number | null;
  publicTransportAccessibility: number | null;
  roadAccessibility: number | null;
  publicTransportQuality: number | null;
  publicTransportTravelTimeMin: number | null;
  roadTravelTimeMin: number | null;
  railTrafficLoad: number | null;
  roadTrafficLoad: number | null;
  landscapeTypeId: number | null;
  solarSuitability: number | null;
  greenAmenityIndex: number | null;
}

export const EMPTY_LOCATION_METRICS: LocationMetrics = {
  temperatureCelsius: null,
  tranquillityIndex: null,
  populationDensityPerKm2: null,
  vacancyRatePercent: null,
  publicTransportAccessibility: null,
  roadAccessibility: null,
  publicTransportQuality: null,
  publicTransportTravelTimeMin: null,
  roadTravelTimeMin: null,
  railTrafficLoad: null,
  roadTrafficLoad: null,
  landscapeTypeId: null,
  solarSuitability: null,
  greenAmenityIndex: null,
};
