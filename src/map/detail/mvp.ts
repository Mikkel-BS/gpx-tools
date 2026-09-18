export type MvpMapDetailId = 'standard' | 'hiking' | 'road' | 'minimal';

export interface MvpMapDetailProfile {
  id: MvpMapDetailId;
  label: string;
  description: string;
}

export const mvpMapDetailProfiles: MvpMapDetailProfile[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Use the vector provider\'s original content and visibility.',
  },
  {
    id: 'hiking',
    label: 'Hiking',
    description: 'Keep paths, waterways and terrain context while removing urban and POI clutter.',
  },
  {
    id: 'road',
    label: 'Road',
    description: 'Prioritize the road network and place labels while suppressing trails and terrain detail.',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Keep only broad geography, major roads and important place labels.',
  },
];

let activeDetailId: MvpMapDetailId = 'standard';

type JsonObject = Record<string, unknown>;

function fingerprint(layer: JsonObject): string {
  const id = typeof layer.id === 'string' ? layer.id : '';
  const sourceLayer = typeof layer['source-layer'] === 'string' ? layer['source-layer'] : '';
  return `${id} ${sourceLayer}`.toLowerCase();
}

function filterText(layer: JsonObject): string {
  return JSON.stringify(layer.filter ?? '').toLowerCase();
}

function classMatches(layer: JsonObject, classes: string[]): boolean {
  const text = filterText(layer);
  return classes.some((value) => text.includes(`"${value}"`));
}

function hideLayer(layer: JsonObject): void {
  const layout = layer.layout && typeof layer.layout === 'object' && !Array.isArray(layer.layout)
    ? { ...(layer.layout as JsonObject) }
    : {};
  layout.visibility = 'none';
  layer.layout = layout;
}

function isSymbol(layer: JsonObject): boolean {
  return layer.type === 'symbol';
}

function isBuildingLayer(layer: JsonObject): boolean {
  return layer['source-layer'] === 'building' || /building/.test(fingerprint(layer));
}

function isPoiLayer(layer: JsonObject): boolean {
  const fp = fingerprint(layer);
  const sourceLayer = layer['source-layer'];
  return sourceLayer === 'poi'
    || /poi|shop|amenity|tourism|place_of_worship|airport|aerodrome/.test(fp);
}

function isPathLayer(layer: JsonObject): boolean {
  const sourceLayer = layer['source-layer'];
  if (sourceLayer !== 'transportation' && sourceLayer !== 'transportation_name') return false;
  return /path|trail|footway|cycleway|bridleway|pedestrian/.test(fingerprint(layer));
}

function isTrackOnlyLayer(layer: JsonObject): boolean {
  const fp = fingerprint(layer);
  return layer['source-layer'] === 'transportation'
    && /track/.test(fp)
    && !/minor|service|rail/.test(fp);
}

function isContourLayer(layer: JsonObject): boolean {
  return /contour/.test(fingerprint(layer));
}

function isNaturalLabel(layer: JsonObject): boolean {
  if (!isSymbol(layer)) return false;
  const fp = fingerprint(layer);
  return /peak|mountain|natural|water|river|stream|park|wood|forest/.test(fp);
}

function isRoadLabel(layer: JsonObject): boolean {
  if (!isSymbol(layer)) return false;
  const sourceLayer = layer['source-layer'];
  return sourceLayer === 'transportation_name'
    || /road[_ -]?name|highway[_ -]?name|road[_ -]?shield|highway[_ -]?shield/.test(fingerprint(layer));
}

function isPathLabel(layer: JsonObject): boolean {
  return isRoadLabel(layer) && /path|trail/.test(fingerprint(layer));
}

function isMajorRoadLayer(layer: JsonObject): boolean {
  const sourceLayer = layer['source-layer'];
  if (sourceLayer !== 'transportation' && sourceLayer !== 'transportation_name') return false;
  return /motorway|trunk|primary|secondary/.test(fingerprint(layer));
}

function isMinorRoadLayer(layer: JsonObject): boolean {
  const sourceLayer = layer['source-layer'];
  if (sourceLayer !== 'transportation' && sourceLayer !== 'transportation_name') return false;
  const fp = fingerprint(layer);
  if (/railway|rail/.test(fp) || classMatches(layer, ['rail'])) return false;
  if (isMajorRoadLayer(layer) || isPathLayer(layer) || isTrackOnlyLayer(layer)) return false;
  return /road|street|tertiary|service|minor|residential/.test(fp);
}

function isPlaceLabel(layer: JsonObject): boolean {
  if (!isSymbol(layer)) return false;
  const sourceLayer = layer['source-layer'];
  return sourceLayer === 'place'
    || /country|state|province|city|town|village|hamlet|place[_ -]?label/.test(fingerprint(layer));
}

function shouldHide(layer: JsonObject, profileId: MvpMapDetailId): boolean {
  const fp = fingerprint(layer);

  if (profileId === 'hiking') {
    if (isPoiLayer(layer)) return true;
    if (isBuildingLayer(layer)) return true;
    if (isRoadLabel(layer) && !isPathLabel(layer) && !isPlaceLabel(layer)) return true;
    if (isSymbol(layer) && /housenumber|house[_ -]?number/.test(fp)) return true;
    return false;
  }

  if (profileId === 'road') {
    if (isPathLayer(layer) || isTrackOnlyLayer(layer)) return true;
    if (isContourLayer(layer)) return true;
    if (isNaturalLabel(layer)) return true;
    if (isPoiLayer(layer)) return true;
    return false;
  }

  if (profileId === 'minimal') {
    if (isBuildingLayer(layer)) return true;
    if (isPoiLayer(layer)) return true;
    if (isPathLayer(layer) || isTrackOnlyLayer(layer)) return true;
    if (isContourLayer(layer)) return true;
    if (isNaturalLabel(layer)) return true;
    if (isMinorRoadLayer(layer)) return true;
    if (isRoadLabel(layer) && !isMajorRoadLayer(layer)) return true;
    if (isSymbol(layer) && !isPlaceLabel(layer) && !isRoadLabel(layer)) {
      if (/housenumber|address|transit|rail|ferry/.test(fp)) return true;
    }
    return false;
  }

  return false;
}

export function getMvpMapDetailProfile(id: string): MvpMapDetailProfile {
  return mvpMapDetailProfiles.find((profile) => profile.id === id) ?? mvpMapDetailProfiles[0];
}

export function getActiveMvpMapDetailProfile(): MvpMapDetailProfile {
  return getMvpMapDetailProfile(activeDetailId);
}

export function setActiveMvpMapDetailProfile(id: string): MvpMapDetailProfile {
  const profile = getMvpMapDetailProfile(id);
  activeDetailId = profile.id;
  return profile;
}

export function isVectorDetailProviderId(providerId: string): boolean {
  return providerId.startsWith('openfreemap-');
}

/**
 * Applies a content-emphasis profile without changing the selected provider,
 * feature data, sources, source-layer references, filters, layer order, paint,
 * zoom thresholds or geometry. Non-essential style layers are hidden only by
 * setting layout.visibility = "none".
 */
export function applyActiveMvpMapDetail(style: Record<string, unknown>): Record<string, unknown> {
  const profile = getActiveMvpMapDetailProfile();
  if (profile.id === 'standard') return style;

  const output = structuredClone(style);
  const layers = Array.isArray(output.layers) ? output.layers as JsonObject[] : [];

  for (const layer of layers) {
    if (shouldHide(layer, profile.id)) hideLayer(layer);
  }

  return output;
}

export function initMvpMapDetailUi(): void {
  const mapControls = document.querySelector<HTMLElement>('.map-controls');
  const routeAppearance = document.querySelector<HTMLSelectElement>('#routeAppearance');
  const baseMap = document.querySelector<HTMLSelectElement>('#baseMap');
  if (!mapControls || !routeAppearance || !baseMap || document.querySelector('#mvpMapDetail')) return;

  const label = document.createElement('label');
  label.className = 'field-label';
  label.dataset.mvpMapDetailControl = 'true';
  label.append('Map content (MVP)');

  const select = document.createElement('select');
  select.id = 'mvpMapDetail';
  for (const profile of mvpMapDetailProfiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.label;
    option.title = profile.description;
    select.append(option);
  }
  label.append(select);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.dataset.mvpMapDetailControl = 'true';

  const syncAvailability = () => {
    const vectorSelected = isVectorDetailProviderId(baseMap.value);
    select.disabled = false;
    label.title = vectorSelected ? '' : 'The selected content profile is saved but only affects OpenFreeMap vector maps.';
    hint.textContent = vectorSelected
      ? 'Controls which categories of vector-map content are shown. It does not change Map Style.'
      : 'Selectable now, but inactive on this raster map. Your choice will apply when you select an OpenFreeMap vector map; Map Style is never changed automatically.';
  };

  const routeLabel = routeAppearance.closest('label');
  if (routeLabel) routeLabel.before(label, hint);
  else mapControls.append(label, hint);

  select.value = activeDetailId;
  syncAvailability();

  select.addEventListener('change', () => {
    setActiveMvpMapDetailProfile(select.value);
    if (isVectorDetailProviderId(baseMap.value)) baseMap.dispatchEvent(new Event('change'));
    syncAvailability();
  });

  baseMap.addEventListener('change', syncAvailability);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMvpMapDetailUi, { once: true });
  else queueMicrotask(initMvpMapDetailUi);
}
