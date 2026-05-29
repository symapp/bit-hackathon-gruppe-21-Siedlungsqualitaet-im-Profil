export interface FeaturedPlace {
  id: string;
  name: string;
  canton: string;
  lat: number;
  lng: number;
  imagePath: string;
  description: string;
}

export const FEATURED_PLACES: readonly FeaturedPlace[] = [
  {
    id: 'zurich',
    name: 'Zurich',
    canton: 'ZH',
    lat: 47.3769,
    lng: 8.5417,
    imagePath: '/featured-places/zurich.jpg',
    description: 'Large metro area with dense jobs and mobility options.',
  },
  {
    id: 'geneve',
    name: 'Geneve',
    canton: 'GE',
    lat: 46.2044,
    lng: 6.1432,
    imagePath: '/featured-places/geneve.jpg',
    description: 'Large romandie city with cross-border dynamics and lakefront.',
  },
  {
    id: 'lugano',
    name: 'Lugano',
    canton: 'TI',
    lat: 46.0037,
    lng: 8.9511,
    imagePath: '/featured-places/lugano.jpg',
    description: 'Mid-size southern city with mixed urban and landscape qualities.',
  },
  {
    id: 'st-gallen',
    name: 'St. Gallen',
    canton: 'SG',
    lat: 47.4245,
    lng: 9.3767,
    imagePath: '/featured-places/st-gallen.jpg',
    description: 'Mid-size city in eastern Switzerland with strong regional role.',
  },
  {
    id: 'thun',
    name: 'Thun',
    canton: 'BE',
    lat: 46.7579,
    lng: 7.6282,
    imagePath: '/featured-places/thun.jpg',
    description: 'Small city at the agglomeration edge and gateway to the Alps.',
  },
  {
    id: 'murten',
    name: 'Murten',
    canton: 'FR',
    lat: 46.9283,
    lng: 7.1171,
    imagePath: '/featured-places/murten.jpg',
    description: 'Compact lakeside town with smaller-scale services and housing.',
  },
  {
    id: 'scuol',
    name: 'Scuol',
    canton: 'GR',
    lat: 46.7976,
    lng: 10.2992,
    imagePath: '/featured-places/scuol.jpg',
    description: 'Peripheral alpine valley settlement with tourism influences.',
  },
  {
    id: 'glarus',
    name: 'Glarus',
    canton: 'GL',
    lat: 47.0406,
    lng: 9.068,
    imagePath: '/featured-places/glarus.jpg',
    description: 'Small mountain canton capital with mixed center-rural character.',
  },
  {
    id: 'adelboden',
    name: 'Adelboden',
    canton: 'BE',
    lat: 46.4919,
    lng: 7.5606,
    imagePath: '/featured-places/adelboden.jpg',
    description: 'Tourism-oriented alpine village with seasonal dynamics.',
  },
  {
    id: 'appenzell',
    name: 'Appenzell',
    canton: 'AI',
    lat: 47.331,
    lng: 9.409,
    imagePath: '/featured-places/appenzell.jpg',
    description: 'Rural small-center context with short local distances.',
  },
] as const;
