export interface GeocodingResult {
  placeId: number;
  label: string;
  lat: number;
  lng: number;
}

export interface GeocodingSuggestionView extends GeocodingResult {
  primary: string;
  secondary: string;
}
