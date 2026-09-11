export interface RasterProvider {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
}

export const rasterProviders: RasterProvider[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
];
