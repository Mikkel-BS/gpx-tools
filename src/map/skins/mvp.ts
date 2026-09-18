export type MvpMapSkinId =
  | 'none'
  | 'watercolor'
  | 'antique-atlas'
  | 'alpine-topo'
  | 'midnight-neon'
  | 'blueprint'
  | 'autumn-field'
  | 'nordic-winter'
  | 'ink-wash'
  | 'desert-sunset';

interface MvpMapSkinPalette {
  background: string;
  water: string;
  waterLine: string;
  forest: string;
  urban: string;
  building: string;
  openLand: string;
  contour: string;
  boundary: string;
  trail: string;
  roadMajor: string;
  roadMajorCasing: string;
  roadMinor: string;
  label: string;
  labelHalo: string;
  fillOpacity?: number;
  forestOpacity?: number;
  roadOpacity?: number;
  labelHaloWidth?: number;
  waterOpacity?: number;
  contourOpacity?: number;
  boundaryOpacity?: number;
  trailDash?: number[];
}

export interface MvpMapSkin {
  id: MvpMapSkinId;
  label: string;
  description: string;
  palette?: MvpMapSkinPalette;
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
    label: 'Watercolor hiking',
    description: 'Warm paper, muted landscape colors and restrained ink-like linework.',
    palette: {
      background: '#f3ecda', water: '#9ebac6', waterLine: '#728f9b', forest: '#a7b39a',
      urban: '#ddd1bd', building: '#cdbb9f', openLand: '#d7cfaa', contour: '#a68a69',
      boundary: '#8a7c6c', trail: '#756555', roadMajor: '#e3c18b', roadMajorCasing: '#806246',
      roadMinor: '#c9aa7a', label: '#40372f', labelHalo: '#f3ecda', forestOpacity: 0.72,
    },
  },
  {
    id: 'antique-atlas',
    label: 'Antique atlas',
    description: 'Sepia paper, faded blue water and copper-brown roadwork inspired by old printed atlases.',
    palette: {
      background: '#e8dcc0', water: '#a8bcc0', waterLine: '#6f8588', forest: '#a9aa83',
      urban: '#cdbda5', building: '#ad967a', openLand: '#d5c69f', contour: '#9a7d59',
      boundary: '#8c6c58', trail: '#705a44', roadMajor: '#d2a467', roadMajorCasing: '#73513c',
      roadMinor: '#b88d5d', label: '#3b2f25', labelHalo: '#e8dcc0', fillOpacity: 0.82,
    },
  },
  {
    id: 'alpine-topo',
    label: 'Alpine topo',
    description: 'Crisp pale terrain, strong contours, cool water and high-visibility hiking lines.',
    palette: {
      background: '#f5f2e8', water: '#8cb9cf', waterLine: '#4f8299', forest: '#a9bf9b',
      urban: '#dedbd0', building: '#bdb8aa', openLand: '#d7d3a8', contour: '#9b7650',
      boundary: '#82766a', trail: '#8d3f2f', roadMajor: '#f0c56e', roadMajorCasing: '#8f7444',
      roadMinor: '#d2b685', label: '#2f3330', labelHalo: '#f5f2e8', forestOpacity: 0.64,
      labelHaloWidth: 1.35,
    },
  },
  {
    id: 'midnight-neon',
    label: 'Midnight neon',
    description: 'Dark navy ground with cyan water, violet vegetation and luminous road accents.',
    palette: {
      background: '#101521', water: '#123d57', waterLine: '#43c6e8', forest: '#1f3c35',
      urban: '#242838', building: '#3c4053', openLand: '#303749', contour: '#6c6489',
      boundary: '#8b78a7', trail: '#ff7cc8', roadMajor: '#ffc857', roadMajorCasing: '#5f4d2a',
      roadMinor: '#6cd4ff', label: '#eef4ff', labelHalo: '#101521', fillOpacity: 0.9,
      forestOpacity: 0.9, roadOpacity: 0.96, labelHaloWidth: 1.5,
    },
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    description: 'Technical drawing aesthetic: deep blue ground, pale cyan linework and restrained fills.',
    palette: {
      background: '#153858', water: '#1e4f72', waterLine: '#8fd5e5', forest: '#214a61',
      urban: '#264663', building: '#3c6480', openLand: '#1c4260', contour: '#78aabd',
      boundary: '#95b8c8', trail: '#d6edf3', roadMajor: '#f2f3dc', roadMajorCasing: '#7694a6',
      roadMinor: '#b6d9e5', label: '#eef9fb', labelHalo: '#153858', fillOpacity: 0.82,
      forestOpacity: 0.72, labelHaloWidth: 1.45,
    },
  },
  {
    id: 'autumn-field',
    label: 'Autumn field',
    description: 'Moss, ochre and rust tones with subdued blue-grey water and warm rural character.',
    palette: {
      background: '#efe5ce', water: '#91a8aa', waterLine: '#627b7d', forest: '#858e5c',
      urban: '#d2bfa8', building: '#b59273', openLand: '#c9ab68', contour: '#976944',
      boundary: '#765e50', trail: '#9b4f35', roadMajor: '#d78c45', roadMajorCasing: '#6f4932',
      roadMinor: '#b97848', label: '#3d3329', labelHalo: '#efe5ce', forestOpacity: 0.8,
    },
  },
  {
    id: 'nordic-winter',
    label: 'Nordic winter',
    description: 'Snow-bright terrain, icy water, dark spruce and red winter-route accents.',
    palette: {
      background: '#f4f7f6', water: '#b8dbe8', waterLine: '#5c94aa', forest: '#6e8d7b',
      urban: '#dfe6e4', building: '#aebdba', openLand: '#e8efec', contour: '#9ba9a5',
      boundary: '#7b8d8b', trail: '#b6403b', roadMajor: '#f1d6a0', roadMajorCasing: '#7f7567',
      roadMinor: '#c9c3b6', label: '#263537', labelHalo: '#f4f7f6', forestOpacity: 0.66,
      waterOpacity: 0.96, contourOpacity: 0.42, trailDash: [3.5, 1.8], labelHaloWidth: 1.35,
    },
  },
  {
    id: 'ink-wash',
    label: 'Ink wash',
    description: 'Mostly monochrome brush-and-ink cartography with restrained blue-grey water.',
    palette: {
      background: '#f0eee8', water: '#c6d1d4', waterLine: '#67757a', forest: '#b8bbb3',
      urban: '#d3d0c8', building: '#aaa69d', openLand: '#dad7cc', contour: '#77736b',
      boundary: '#5f5b55', trail: '#35322f', roadMajor: '#d0c7b6', roadMajorCasing: '#47433e',
      roadMinor: '#8c867d', label: '#242321', labelHalo: '#f0eee8', fillOpacity: 0.64,
      forestOpacity: 0.58, roadOpacity: 0.86, waterOpacity: 0.82, contourOpacity: 0.68,
      boundaryOpacity: 0.72, trailDash: [1.2, 1.5], labelHaloWidth: 1.25,
    },
  },
  {
    id: 'desert-sunset',
    label: 'Desert sunset',
    description: 'Sand, coral, turquoise and plum tones for a playful warm-climate poster-map look.',
    palette: {
      background: '#f3d8b6', water: '#67b7b2', waterLine: '#2e7777', forest: '#89935d',
      urban: '#e7b49f', building: '#bb806d', openLand: '#e8bf78', contour: '#b76d52',
      boundary: '#7d5264', trail: '#8e315c', roadMajor: '#f39855', roadMajorCasing: '#774637',
      roadMinor: '#d58a62', label: '#4a2e3c', labelHalo: '#f3d8b6', fillOpacity: 0.78,
      forestOpacity: 0.74, roadOpacity: 0.94, waterOpacity: 0.94, contourOpacity: 0.6,
      boundaryOpacity: 0.62, trailDash: [4, 1.5], labelHaloWidth: 1.25,
    },
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
 * Deliberately changes only paint properties. Sources, source-layer references,
 * filters, layout, layer ordering, zoom bounds and feature geometry are untouched.
 * GPX layers are rendered separately and are unaffected by map skins.
 */
export function applyActiveMvpMapSkin(style: Record<string, unknown>): Record<string, unknown> {
  const skin = getActiveMvpMapSkin();
  const palette = skin.palette;
  if (!palette) return style;

  const output = structuredClone(style);
  const layers = Array.isArray(output.layers) ? output.layers as JsonObject[] : [];
  const fillOpacity = palette.fillOpacity ?? 0.7;
  const forestOpacity = palette.forestOpacity ?? 0.72;
  const roadOpacity = palette.roadOpacity ?? 0.9;

  for (const layer of layers) {
    const type = typeof layer.type === 'string' ? layer.type : '';
    const fp = fingerprint(layer);

    if (type === 'background') {
      setPaint(layer, 'background-color', palette.background);
      continue;
    }

    if (type === 'fill') {
      if (/water|lake|ocean|sea/.test(fp)) {
        setPaint(layer, 'fill-color', palette.water);
        setPaint(layer, 'fill-opacity', palette.waterOpacity ?? 0.92);
      } else if (/wood|forest|landcover|park|nature|scrub|vegetation/.test(fp)) {
        setPaint(layer, 'fill-color', palette.forest);
        setPaint(layer, 'fill-opacity', forestOpacity);
      } else if (/residential|urban|industrial|commercial/.test(fp)) {
        setPaint(layer, 'fill-color', palette.urban);
        setPaint(layer, 'fill-opacity', fillOpacity);
      } else if (/building/.test(fp)) {
        setPaint(layer, 'fill-color', palette.building);
        setPaint(layer, 'fill-opacity', Math.min(1, fillOpacity + 0.02));
      } else if (/grass|meadow|farmland|landuse/.test(fp)) {
        setPaint(layer, 'fill-color', palette.openLand);
        setPaint(layer, 'fill-opacity', Math.max(0.45, fillOpacity - 0.12));
      }
      continue;
    }

    if (type === 'line') {
      if (/water|river|stream|canal/.test(fp)) {
        setPaint(layer, 'line-color', palette.waterLine);
        setPaint(layer, 'line-opacity', 0.84);
      } else if (/contour/.test(fp)) {
        setPaint(layer, 'line-color', palette.contour);
        setPaint(layer, 'line-opacity', palette.contourOpacity ?? 0.58);
      } else if (/boundary|admin/.test(fp)) {
        setPaint(layer, 'line-color', palette.boundary);
        setPaint(layer, 'line-opacity', palette.boundaryOpacity ?? 0.58);
      } else if (/path|track|trail|footway|cycleway|bridleway/.test(fp)) {
        setPaint(layer, 'line-color', palette.trail);
        setPaint(layer, 'line-opacity', 0.86);
        setPaint(layer, 'line-dasharray', palette.trailDash ?? [2.5, 2]);
      } else if (/motorway|trunk|primary|secondary/.test(fp)) {
        setPaint(layer, 'line-color', /casing|outline/.test(fp) ? palette.roadMajorCasing : palette.roadMajor);
        setPaint(layer, 'line-opacity', roadOpacity);
      } else if (/road|street|tertiary|service/.test(fp)) {
        setPaint(layer, 'line-color', palette.roadMinor);
        setPaint(layer, 'line-opacity', Math.max(0.72, roadOpacity - 0.04));
      }
      continue;
    }

    if (type === 'symbol') {
      setPaint(layer, 'text-color', palette.label);
      setPaint(layer, 'text-halo-color', palette.labelHalo);
      setPaint(layer, 'text-halo-width', palette.labelHaloWidth ?? 1.1);
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
    option.title = skin.description;
    select.append(option);
  }
  label.append(select);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.dataset.mvpMapSkinControl = 'true';
  hint.textContent = 'Deterministic vector-map skins. Choosing one from a raster map automatically switches to OpenFreeMap Positron. No AI is used at runtime.';

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
