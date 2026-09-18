export type MvpMapDetailId = 'standard' | 'hiking' | 'road' | 'minimal';

export interface MvpMapDetailProfile {
  id: MvpMapDetailId;
  label: string;
  description: string;
}

export const DEFAULT_MVP_DETAIL_VECTOR_PROVIDER_ID = 'openfreemap-positron';

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

function fingerprint(layer: JsonObject): string {
  const id = typeof layer.id === 'string' ? layer.id : '';
  const sourceLayer = typeof layer['source-layer'] === 'string' ? layer['source-layer'] : '';
  return `${id} ${sourceLayer}`.toLowerCase();
}

function shiftMinzoom(layer: JsonObject, delta: number): void {
  const current = typeof layer.minzoom === 'number' && Number.isFinite(layer.minzoom) ? layer.minzoom : 0;
  layer.minzoom = Math.max(0, Math.min(24, current + delta));
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

export function resolveMvpDetailSelection(detailId: string, baseProviderId: string): {
  profile: MvpMapDetailProfile;
  baseProviderId: string;
} {
  const profile = getMvpMapDetailProfile(detailId);
  if (profile.id !== 'standard' && !isVectorDetailProviderId(baseProviderId)) {
    return { profile, baseProviderId: DEFAULT_MVP_DETAIL_VECTOR_PROVIDER_ID };
  }
  return { profile, baseProviderId };
}

/**
 * Adjusts only layer minzoom values. Sources, source-layer references, filters,
 * layout, paint, maxzoom and feature geometry are left unchanged.
 *
 * Lower minzoom means "eligible to appear earlier". Whether a feature is
 * actually available still depends on the underlying vector-tile data.
 */
export function applyActiveMvpMapDetail(style: Record<string, unknown>): Record<string, unknown> {
  const profile = getActiveMvpMapDetailProfile();
  if (profile.id === 'standard') return style;

  const output = structuredClone(style);
  const layers = Array.isArray(output.layers) ? output.layers as JsonObject[] : [];

  for (const layer of layers) {
    const type = typeof layer.type === 'string' ? layer.type : '';
    const fp = fingerprint(layer);
    const isSymbol = type === 'symbol';

    if (profile.id === 'hiking') {
      if (/path|track|trail|footway|cycleway|bridleway/.test(fp)) shiftMinzoom(layer, -2);
      else if (/stream|river|waterway|canal/.test(fp)) shiftMinzoom(layer, -1);
      else if (/contour/.test(fp)) shiftMinzoom(layer, -1);
      else if (isSymbol && /peak|mountain|natural|water|river|stream|trail|path/.test(fp)) shiftMinzoom(layer, -1);
      continue;
    }

    if (profile.id === 'road') {
      if (/motorway|trunk|primary|secondary/.test(fp)) shiftMinzoom(layer, -2);
      else if (/road|street|tertiary|service/.test(fp)) shiftMinzoom(layer, -1);
      else if (isSymbol && /road|street|motorway|trunk|primary|secondary/.test(fp)) shiftMinzoom(layer, -1);
      else if (/path|track|trail|footway|bridleway|contour/.test(fp)) shiftMinzoom(layer, 1);
      continue;
    }

    if (profile.id === 'minimal') {
      if (/path|track|trail|footway|cycleway|bridleway/.test(fp)) shiftMinzoom(layer, 3);
      else if (/contour/.test(fp)) shiftMinzoom(layer, 2);
      else if (/stream|river|waterway|canal/.test(fp)) shiftMinzoom(layer, 1);
      else if (/road|street|tertiary|service/.test(fp) && !/motorway|trunk|primary|secondary/.test(fp)) shiftMinzoom(layer, 2);
      else if (isSymbol && /poi|place_of_worship|shop|amenity|tourism|natural|peak/.test(fp)) shiftMinzoom(layer, 2);
    }
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
  hint.textContent = 'Controls when vector-map details become visible. Choosing a non-standard profile from a raster map switches to OpenFreeMap Positron.';

  const routeLabel = routeAppearance.closest('label');
  if (routeLabel) routeLabel.before(label, hint);
  else mapControls.append(label, hint);

  select.value = activeDetailId;

  select.addEventListener('change', () => {
    const resolved = resolveMvpDetailSelection(select.value, baseMap.value);
    setActiveMvpMapDetailProfile(resolved.profile.id);
    select.value = resolved.profile.id;
    if (baseMap.value !== resolved.baseProviderId) baseMap.value = resolved.baseProviderId;
    if (isVectorDetailProviderId(baseMap.value)) baseMap.dispatchEvent(new Event('change'));
  });

  baseMap.addEventListener('change', () => {
    if (isVectorDetailProviderId(baseMap.value)) return;
    if (getActiveMvpMapDetailProfile().id === 'standard') return;
    setActiveMvpMapDetailProfile('standard');
    select.value = 'standard';
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMvpMapDetailUi, { once: true });
  else queueMicrotask(initMvpMapDetailUi);
}
