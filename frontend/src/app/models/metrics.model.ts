export interface LocationMetrics {
  restaurants: number;
  supermarkets: number;
  publicTransport: number;
  parks: number;
  schools: number;
  pharmacies: number;
}

export interface LocationData {
  lat: number;
  lng: number;
  radius: number;
  address?: string;
  metrics: LocationMetrics;
}
