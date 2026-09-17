import { applyActiveMvpMapSkin } from '../skins/mvp';

export type VectorStylePublicationPolicy = 'allowed-with-attribution' | 'blocked-review';

export interface VectorStyleProvider {
  kind: 'vector-style';
  id: string;
  label: string;
  styleUrl: string;
  attribution: string;
  description: string;
  publicationExportPolicy: VectorStylePublicationPolicy;
  publicationAttribution: string;
  publicationNotice: string;
  licenseUrl: string;
  termsUrl: string;
}

const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles · Data from OpenStreetMap';
const OPENFREEMAP_NOTICE = 'OpenFreeMap permits commercial use and explicitly requires attribution for printed media/video. The exporter embeds the required OpenFreeMap/OpenMapTiles/OpenStreetMap credit.';

export const vectorStyleProviders: VectorStyleProvider[] = [
  {
    kind: 'vector-style',
    id: 'openfreemap-positron',
    label: 'OpenFreeMap · Positron',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    attribution: OPENFREEMAP_ATTRIBUTION,
    description: 'Quiet editorial light style with restrained color; well suited to route-focused layouts.',
    publicationExportPolicy: 'allowed-with-attribution',
    publicationAttribution: OPENFREEMAP_ATTRIBUTION,
    publicationNotice: OPENFREEMAP_NOTICE,
    licenseUrl: 'https://openfreemap.org/',
    termsUrl: 'https://openfreemap.org/tos/',
  },
  {
    kind: 'vector-style',
    id: 'openfreemap-liberty',
    label: 'OpenFreeMap · Liberty',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    attribution: OPENFREEMAP_ATTRIBUTION,
    description: 'Balanced full-color style with clear roads, land use and labels.',
    publicationExportPolicy: 'allowed-with-attribution',
    publicationAttribution: OPENFREEMAP_ATTRIBUTION,
    publicationNotice: OPENFREEMAP_NOTICE,
    licenseUrl: 'https://openfreemap.org/',
    termsUrl: 'https://openfreemap.org/tos/',
  },
  {
    kind: 'vector-style',
    id: 'openfreemap-fiord',
    label: 'OpenFreeMap · Fiord',
    styleUrl: 'https://tiles.openfreemap.org/styles/fiord',
    attribution: OPENFREEMAP_ATTRIBUTION,
    description: 'Muted cool-toned cartography with a strong landscape character.',
    publicationExportPolicy: 'allowed-with-attribution',
    publicationAttribution: OPENFREEMAP_ATTRIBUTION,
    publicationNotice: OPENFREEMAP_NOTICE,
    licenseUrl: 'https://openfreemap.org/',
    termsUrl: 'https://openfreemap.org/tos/',
  },
  {
    kind: 'vector-style',
    id: 'openfreemap-dark',
    label: 'OpenFreeMap · Dark',
    styleUrl: 'https://tiles.openfreemap.org/styles/dark',
    attribution: OPENFREEMAP_ATTRIBUTION,
    description: 'Dark presentation style for screen use and high-contrast route overlays.',
    publicationExportPolicy: 'allowed-with-attribution',
    publicationAttribution: OPENFREEMAP_ATTRIBUTION,
    publicationNotice: OPENFREEMAP_NOTICE,
    licenseUrl: 'https://openfreemap.org/',
    termsUrl: 'https://openfreemap.org/tos/',
  },
];

export function getVectorStyleProvider(id: string): VectorStyleProvider | undefined {
  return vectorStyleProviders.find((provider) => provider.id === id);
}

/**
 * OpenLayers/ol-mapbox-style cannot use MapLibre PBF glyphs directly and otherwise
 * attempts to resolve web fonts from a third-party CDN. For this app we deliberately
 * normalize label fonts to common system fonts so choosing a vector basemap does not
 * introduce a hidden font-CDN dependency.
 */
export async function loadVectorStyle(provider: VectorStyleProvider): Promise<Record<string, unknown>> {
  const response = await fetch(provider.styleUrl, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`Could not load ${provider.label} (${response.status}).`);
  const sourceStyle = await response.json() as Record<string, unknown>;
  const style = applyActiveMvpMapSkin(sourceStyle);
  const layers = Array.isArray(style.layers) ? style.layers as Array<Record<string, unknown>> : [];
  for (const layer of layers) {
    const layout = layer.layout;
    if (layout && typeof layout === 'object' && !Array.isArray(layout)) {
      const typedLayout = layout as Record<string, unknown>;
      if ('text-font' in typedLayout) typedLayout['text-font'] = ['Arial', 'sans-serif'];
    }
  }
  delete style.glyphs;
  return style;
}
