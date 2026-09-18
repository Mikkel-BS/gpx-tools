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
    description: 'Use the vector provider\'s original visibility thresholds.',
  },
  {
    id: 'hiking',
    label: 'Hiking',
    description: 'Reveal paths, tracks, streams, contours and natural-feature labels earlier.',
  },
  {
    id: 'road',
    label: 'Road',
    description: 'Reveal roads and road labels earlier while de-emphasizing trails and contours.',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Delay minor roads, trails, contours, streams and POIs for a cleaner overview.',
  },
];

let activeDetailId: MvpMapDetailId = 'standard';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function fingerprint(layer: JsonObject): string {
  const id = typeof layer.id === 'string' ? layer.id : '';
  const sourceLayer = typeof layer['source-layer'] === 'string' ? layer['source-layer'] : '';
  return `${id} ${sourceLayer}`.toLowerCase();
}

function shiftMinzoom(layer: JsonObject, delta: number): void {
  if (typeof layer.minzoom !== 'number' || !Number.isFinite(layer.minzoom)) return;
  layer.minzoom = Math.max(0, Math.min(24, layer.minzoom + delta));
}

function shiftZoomExpression(value: unknown, delta: number): unknown {
  if (!Array.isArray(value)) return value;

  // Mapbox expressions where numeric stops follow an explicit ["zoom"] input.
  if ((value[0] === 'interpolate' || value[0] === 'step') && Array.isArray(value[2]) && value[2][0] === 'zoom') {
    const output = structuredClone(value) as unknown[];
    const firstStopIndex = value[0] === 'interpolate' ? 3 : 4;
    for (let index = firstStopIndex; index < output.length; index += 2) {
      if (typeof output[index] === 'number' && Number.isFinite(output[index])) {
        output[index] = Math.max(0, Math.min(24, (output[index] as number) + delta));
      }
    }
    return output;
  }

  return value.map((item) => shiftZoomExpression(item, delta));
}

function shiftLayerZoomStyling(layer: JsonObject, delta: number): void {
  shiftMinzoom(layer, delta);

  for (const propertyName of ['paint', 'layout'] as const) {
    const source = asObject(layer[propertyName]);
    if (!Object.keys(source).length) continue;
    const shifted: JsonObject = {};
    for (const [key, value] of Object.entries(source)) {
      shifted[key] = shiftZoomExpression(value, delta);
    }
    layer[propertyName] = shifted;
  }
}

function filterText(layer: JsonObject): string {
  return JSON.stringify(layer.filter ?? '').toLowerCase();
}

function classMatches(layer: JsonObject, classes: string[]): boolean {
  const text = filterText(layer);
  return classes.some((value) => text.includes(`"${value}"`));
}

function isPathLayer(layer: JsonObject): boolean {
  const sourceLayer = layer['source-layer'];
  if (sourceLayer !== 'transportation' && sourceLayer !== 'transportation_name') return false;
  return /path|trail|footway|cycleway|bridleway|track/.test(fingerprint(layer));
}

function isWaterwayLayer(layer: JsonObject): boolean {
  return layer['source-layer'] === 'waterway' || /stream|river|waterway|canal/.test(fingerprint(layer));
}

function isContourLayer(layer: JsonObject): boolean {
  return /contour/.test(fingerprint(layer));
}

function isMajorRoadLayer(layer: JsonObject): boolean {
  if (layer['source-layer'] !== 'transportation' && layer['source-layer'] !== 'transportation_name') return false;
  return /motorway|trunk|primary|secondary/.test(fingerprint(layer))
    || classMatches(layer, ['motorway', 'trunk', 'primary', 'secondary']);
}

function isMinorRoadLayer(layer: JsonObject): boolean {
  if (layer['source-layer'] !== 'transportation' && layer['source-layer'] !== 'transportation_name') return false;
  const fp = fingerprint(layer);
  if (/railway|rail/.test(fp) || classMatches(layer, ['rail'])) return false;
  if (isMajorRoadLayer(layer) || isPathLayer(layer)) return false;
  return /road|street|tertiary|service|minor/.test(fp)
    || classMatches(layer, ['tertiary', 'minor', 'service', 'street']);
}

function detailShift(layer: JsonObject, profileId: MvpMapDetailId): number {
  const type = typeof layer.type === 'string' ? layer.type : '';
  const fp = fingerprint(layer);
  const isSymbol = type === 'symbol';

  if (profileId === 'hiking') {
    if (isPathLayer(layer)) return -2;
    if (isWaterwayLayer(layer) || isContourLayer(layer)) return -1;
    if (isSymbol && /peak|mountain|natural|water|river|stream|trail|path/.test(fp)) return -1;
    return 0;
  }

  if (profileId === 'road') {
    if (isMajorRoadLayer(layer)) return -2;
    if (isMinorRoadLayer(layer)) return -1;
    if (isPathLayer(layer) || isContourLayer(layer)) return 1;
    return 0;
  }

  if (profileId === 'minimal') {
    if (isPathLayer(layer)) return 3;
    if (isContourLayer(layer)) return 2;
    if (isWaterwayLayer(layer)) return 1;
    if (isMinorRoadLayer(layer)) return 2;
    if (isSymbol && /poi|place_of_worship|shop|amenity|tourism|natural|peak/.test(fp)) return 2;
  }

  return 0;
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
 * Applies a detail profile without changing the selected map provider.
 *
 * For matching vector-style layers, it shifts explicit minzoom values and
 * zoom stops inside paint/layout interpolate/step expressions. Feature data,
 * sources, source-layer references and filters are never changed.
 */
export function applyActiveMvpMapDetail(style: Record<string, unknown>): Record<string, unknown> {
  const profile = getActiveMvpMapDetailProfile();
  if (profile.id === 'standard') return style;

  const output = structuredClone(style);
  const layers = Array.isArray(output.layers) ? output.layers as JsonObject[] : [];

  for (const layer of layers) {
    const delta = detailShift(layer, profile.id);
    if (delta !== 0) shiftLayerZoomStyling(layer, delta);
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
  label.append('Map detail (MVP)');

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
    label.title = vectorSelected ? '' : 'The selected detail profile is saved but only affects OpenFreeMap vector maps.';
    hint.textContent = vectorSelected
      ? 'Controls when vector-map details become visible without changing the selected map style.'
      : 'Selectable now, but inactive on this raster map. Your choice will apply when you select an OpenFreeMap vector map; Map Style is never changed automatically.';
  };

  const routeLabel = routeAppearance.closest('label');
  if (routeLabel) routeLabel.before(label, hint);
  else mapControls.append(label, hint);

  select.value = activeDetailId;
  syncAvailability();

  select.addEventListener('change', () => {
    setActiveMvpMapDetailProfile(select.value);
    // Reload only when the current provider is vector-capable. Raster maps keep
    // their exact provider/style and simply remember the selected detail profile.
    if (isVectorDetailProviderId(baseMap.value)) baseMap.dispatchEvent(new Event('change'));
    syncAvailability();
  });

  baseMap.addEventListener('change', syncAvailability);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMvpMapDetailUi, { once: true });
  else queueMicrotask(initMvpMapDetailUi);
}
