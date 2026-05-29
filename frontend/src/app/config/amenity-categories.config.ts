export interface AmenityCategoryDef {
  id: string;
  categoryKey: string;
  labelKey: string;
  metricUnitKey: string;
  clim: [number, number];
  higherIsBetter: boolean;
  formatValue: (value: number) => string;
}

export const AMENITY_CATEGORIES: AmenityCategoryDef[] = [
  {
    id: 'amenity-shopping',
    categoryKey: 'shopping',
    labelKey: 'layers.amenities.shopping.label',
    metricUnitKey: 'layers.amenities.shopping.metricUnit',
    clim: [0, 10],
    higherIsBetter: true,
    formatValue: (v) => String(Math.round(v)),
  },
  {
    id: 'amenity-health',
    categoryKey: 'health',
    labelKey: 'layers.amenities.health.label',
    metricUnitKey: 'layers.amenities.health.metricUnit',
    clim: [0, 5],
    higherIsBetter: true,
    formatValue: (v) => String(Math.round(v)),
  },
  {
    id: 'amenity-pharmacy',
    categoryKey: 'pharmacy',
    labelKey: 'layers.amenities.pharmacy.label',
    metricUnitKey: 'layers.amenities.pharmacy.metricUnit',
    clim: [0, 3],
    higherIsBetter: true,
    formatValue: (v) => String(Math.round(v)),
  },
  {
    id: 'amenity-culture',
    categoryKey: 'culture',
    labelKey: 'layers.amenities.culture.label',
    metricUnitKey: 'layers.amenities.culture.metricUnit',
    clim: [0, 3],
    higherIsBetter: true,
    formatValue: (v) => String(Math.round(v)),
  },
  {
    id: 'amenity-hospital',
    categoryKey: 'hospital',
    labelKey: 'layers.amenities.hospital.label',
    metricUnitKey: 'layers.amenities.hospital.metricUnit',
    clim: [0, 2],
    higherIsBetter: true,
    formatValue: (v) => String(Math.round(v)),
  },
];

export const AMENITY_CATEGORY_IDS = AMENITY_CATEGORIES.map((c) => c.id);
