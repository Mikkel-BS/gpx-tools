export interface RasterProvider {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
  description?: string;
}

export const rasterProviders: RasterProvider[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    description: 'General-purpose global street map.',
  },
  {
    id: 'kartverket-topo',
    label: 'Kartverket · Topographic',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
    attribution: '© Kartverket',
    maxZoom: 18,
    description: 'Norwegian topographic basemap from Kartverket.',
  },
  {
    id: 'kartverket-gray',
    label: 'Kartverket · Greyscale',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png',
    attribution: '© Kartverket',
    maxZoom: 18,
    description: 'Greyscale Norwegian topographic basemap from Kartverket.',
  },
];

export function getRasterProvider(id: string): RasterProvider {
  return rasterProviders.find((provider) => provider.id === id) ?? rasterProviders[0];
}
