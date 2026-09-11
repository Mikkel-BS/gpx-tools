export type PublicationExportPolicy = 'allowed-with-attribution' | 'blocked-review';

export interface RasterProvider {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
  description?: string;
  publicationExportPolicy: PublicationExportPolicy;
  publicationAttribution: string;
  publicationNotice: string;
  licenseUrl: string;
}

export const rasterProviders: RasterProvider[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    description: 'General-purpose global street map.',
    publicationExportPolicy: 'allowed-with-attribution',
    publicationAttribution: '© OpenStreetMap contributors · https://www.openstreetmap.org/copyright',
    publicationNotice: 'Static/printed use is permitted with visible OpenStreetMap attribution and an ODbL notice. This app embeds the required credit in exported images.',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
  },
  {
    id: 'kartverket-topo',
    label: 'Kartverket · Topographic',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
    attribution: '© Kartverket',
    maxZoom: 18,
    description: 'Norwegian topographic basemap from Kartverket.',
    publicationExportPolicy: 'blocked-review',
    publicationAttribution: '© Kartverket',
    publicationNotice: 'Publication export is conservatively disabled for Kartverket cache tiles. Kartverket notes that cache/WMS services can include Geovekst data at detailed zoom levels for which separate permission may be required for copying or other reuse.',
    licenseUrl: 'https://www.kartverket.no/en/api-and-data/terms-of-use',
  },
  {
    id: 'kartverket-gray',
    label: 'Kartverket · Greyscale',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png',
    attribution: '© Kartverket',
    maxZoom: 18,
    description: 'Greyscale Norwegian topographic basemap from Kartverket.',
    publicationExportPolicy: 'blocked-review',
    publicationAttribution: '© Kartverket',
    publicationNotice: 'Publication export is conservatively disabled for Kartverket cache tiles. Kartverket notes that cache/WMS services can include Geovekst data at detailed zoom levels for which separate permission may be required for copying or other reuse.',
    licenseUrl: 'https://www.kartverket.no/en/api-and-data/terms-of-use',
  },
];

export function getRasterProvider(id: string): RasterProvider {
  return rasterProviders.find((provider) => provider.id === id) ?? rasterProviders[0];
}
