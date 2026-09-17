export type MvpMapSkinId = 'none' | 'watercolor';

export interface MvpMapSkin {
  id: MvpMapSkinId;
  label: string;
  description: string;
}

export const DEFAULT_MVP_SKIN_VECTOR_PROVIDER_ID = 'openfreemap-positron';

export const mvpMapSkins: MvpMapSkin[] = [
  {
    id: 'none',
    label: 'None',
    description: 'Use the vector map provider exactly as supplied.',
  },
  {
    id: 'watercolor',
    label: 'Watercolor hiking (MVP)',
    description: 'Warm paper, muted landscape colors and restrained ink-like linework.',
  },
];

let activeSkinId: MvpMapSkinId = 'none';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function fingerprint(layer: JsonObject): string {
  const id = typeof layer.id === 'string' ? layer.id : '';
  const sourceLayer = typeof layer['source-layer'] === 'string' ? layer['source-layer'] : '';
  return `${id} ${sourceLayer}`.toLowerCase();
}

function setPaint(layer: JsonObject, key: string, value: unknown): void {
  const paint = { ...asObject(layer.paint) };
  paint[key] = value;
  layer.paint = paint;
}

export function getMvpMapSkin(id: string): MvpMapSkin {
  return mvpMapSkins.find((skin) => skin.id === id) ?? mvpMapSkins[0];
}

export function getActiveMvpMapSkin(): MvpMapSkin {
  return getMvpMapSkin(activeSkinId);
}

export function setActiveMvpMapSkin(id: string): MvpMapSkin {
  const skin = getMvpMapSkin(id);
  activeSkinId = skin.id;
  return skin;
}

export function isVectorMapProviderId(providerId: string): boolean {
  return providerId.startsWith('openfreemap-');
}

/**
 * Pure interaction rule used by the UI and tests.
 * Selecting a non-default skin from a raster map automatically moves to the
 * default vector provider, because skins operate on vector-style paint values.
 */
export function resolveMvpSkinSelection(skinId: string, baseProviderId: string): {
  skin: MvpMapSkin;
  baseProviderId: string;
} {
  const skin = getMvpMapSkin(skinId);
  if (skin.id !== 'none' && !isVectorMapProviderId(baseProviderId)) {
    return { skin, baseProviderId: DEFAULT_MVP_SKIN_VECTOR_PROVIDER_ID };
  }
  return { skin, baseProviderId };
}

/**
 * MVP skinning is deliberately limited to Mapbox-style paint/layout values.
 * Sources, source-layer references, filters, layer order and feature geometry
 * are copied unchanged. GPX layers live outside this style and are unaffected.
 */
export function applyActiveMvpMapSkin(style: Record<string, unknown>): Record<string, unknown> {
  const skin = getActiveMvpMapSkin();
  if (skin.id === 'none') return style;

  const output = structuredClone(style);
  const layers = Array.isArray(output.layers) ? output.layers as JsonObject[] : [];

  for (const layer of layers) {
    const type = typeof layer.type === 'string' ? layer.type : '';
    const fp = fingerprint(layer);

    if (type === 'background') {
      setPaint(layer, 'background-color', '#f3ecda');
      continue;
    }

    if (type === 'fill') {
      if (/water|lake|ocean|sea/.test(fp)) {
        setPaint(layer, 'fill-color', '#9ebac6');
        setPaint(layer, 'fill-opacity', 0.92);
      } else if (/wood|forest|landcover|park|nature|scrub|vegetation/.test(fp)) {
        setPaint(layer, 'fill-color', '#a7b39a');
        setPaint(layer, 'fill-opacity', 0.72);
      } else if (/residential|urban|industrial|commercial/.test(fp)) {
        setPaint(layer, 'fill-color', '#ddd1bd');
        setPaint(layer, 'fill-opacity', 0.7);
      } else if (/building/.test(fp)) {
        setPaint(layer, 'fill-color', '#cdbb9f');
        setPaint(layer, 'fill-opacity', 0.72);
      } else if (/grass|meadow|farmland|landuse/.test(fp)) {
        setPaint(layer, 'fill-color', '#d7cfaa');
        setPaint(layer, 'fill-opacity', 0.56);
      }
      continue;
    }

    if (type === 'line') {
      if (/water|river|stream|canal/.test(fp)) {
        setPaint(layer, 'line-color', '#728f9b');
        setPaint(layer, 'line-opacity', 0.8);
      } else if (/contour/.test(fp)) {
        setPaint(layer, 'line-color', '#a68a69');
        setPaint(layer, 'line-opacity', 0.52);
      } else if (/boundary|admin/.test(fp)) {
        setPaint(layer, 'line-color', '#8a7c6c');
        setPaint(layer, 'line-opacity', 0.55);
      } else if (/path|track|trail|footway|cycleway|bridleway/.test(fp)) {
        setPaint(layer, 'line-color', '#756555');
        setPaint(layer, 'line-opacity', 0.82);
        setPaint(layer, 'line-dasharray', [2.5, 2]);
      } else if (/motorway|trunk|primary|secondary/.test(fp)) {
        setPaint(layer, 'line-color', /casing|outline/.test(fp) ? '#806246' : '#e3c18b');
        setPaint(layer, 'line-opacity', 0.9);
      } else if (/road|street|tertiary|service/.test(fp)) {
        setPaint(layer, 'line-color', '#c9aa7a');
        setPaint(layer, 'line-opacity', 0.86);
      }
      continue;
    }

    if (type === 'symbol') {
      setPaint(layer, 'text-color', '#40372f');
      setPaint(layer, 'text-halo-color', '#f3ecda');
      setPaint(layer, 'text-halo-width', 1.1);
      setPaint(layer, 'text-halo-blur', 0.35);
    }
  }

  return output;
}

export function initMvpMapSkinUi(): void {
  const mapControls = document.querySelector<HTMLElement>('.map-controls');
  const routeAppearance = document.querySelector<HTMLSelectElement>('#routeAppearance');
  const baseMap = document.querySelector<HTMLSelectElement>('#baseMap');
  if (!mapControls || !routeAppearance || !baseMap || document.querySelector('#mvpMapSkin')) return;

  const label = document.createElement('label');
  label.className = 'field-label';
  label.dataset.mvpMapSkinControl = 'true';
  label.append('Map skin (MVP)');

  const select = document.createElement('select');
  select.id = 'mvpMapSkin';
  for (const skin of mvpMapSkins) {
    const option = document.createElement('option');
    option.value = skin.id;
    option.textContent = skin.label;
    select.append(option);
  }
  label.append(select);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.dataset.mvpMapSkinControl = 'true';
  hint.textContent = 'Experimental vector-map skin. Choosing a skin from a raster map automatically switches to OpenFreeMap Positron. No AI is used at runtime.';

  const routeLabel = routeAppearance.closest('label');
  if (routeLabel) routeLabel.before(label, hint);
  else mapControls.append(label, hint);

  select.value = activeSkinId;

  select.addEventListener('change', () => {
    const resolved = resolveMvpSkinSelection(select.value, baseMap.value);
    setActiveMvpMapSkin(resolved.skin.id);
    select.value = resolved.skin.id;
    if (baseMap.value !== resolved.baseProviderId) baseMap.value = resolved.baseProviderId;
    if (isVectorMapProviderId(baseMap.value)) baseMap.dispatchEvent(new Event('change'));
  });

  baseMap.addEventListener('change', () => {
    if (isVectorMapProviderId(baseMap.value)) return;
    if (getActiveMvpMapSkin().id === 'none') return;
    setActiveMvpMapSkin('none');
    select.value = 'none';
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMvpMapSkinUi, { once: true });
  else queueMicrotask(initMvpMapSkinUi);
}
