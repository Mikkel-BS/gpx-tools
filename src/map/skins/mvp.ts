export type MvpMapSkinId = 'none' | 'watercolor';

export interface MvpMapSkin {
  id: MvpMapSkinId;
  label: string;
  description: string;
  cssFilter: string;
  canvasFilter: string;
  overlayOpacity: number;
}

export const mvpMapSkins: MvpMapSkin[] = [
  {
    id: 'none',
    label: 'None',
    description: 'Use the map provider exactly as supplied.',
    cssFilter: 'none',
    canvasFilter: 'none',
    overlayOpacity: 0,
  },
  {
    id: 'watercolor',
    label: 'Watercolor (MVP)',
    description: 'Warm, muted paper-like treatment. Geometry remains unchanged.',
    cssFilter: 'sepia(0.18) saturate(0.78) contrast(0.96) brightness(1.035)',
    canvasFilter: 'sepia(18%) saturate(78%) contrast(96%) brightness(103.5%)',
    overlayOpacity: 0.075,
  },
];

let activeSkinId: MvpMapSkinId = 'none';

export function getMvpMapSkin(id: string): MvpMapSkin {
  return mvpMapSkins.find((skin) => skin.id === id) ?? mvpMapSkins[0];
}

export function getActiveMvpMapSkin(): MvpMapSkin {
  return getMvpMapSkin(activeSkinId);
}

export function setActiveMvpMapSkin(id: string): MvpMapSkin {
  const skin = getMvpMapSkin(id);
  activeSkinId = skin.id;
  applySkinToInteractiveMap(skin);
  return skin;
}

function ensureStyles(): void {
  if (document.querySelector('#mvp-map-skin-styles')) return;
  const style = document.createElement('style');
  style.id = 'mvp-map-skin-styles';
  style.textContent = `
    #map .ol-viewport { transition: filter 120ms ease; }
    #map[data-mvp-map-skin="watercolor"] .ol-viewport { filter: sepia(.18) saturate(.78) contrast(.96) brightness(1.035); }
    #map .mvp-map-skin-overlay {
      position: absolute;
      inset: 0;
      z-index: 40;
      pointer-events: none;
      opacity: 0;
      mix-blend-mode: multiply;
      background-image:
        repeating-linear-gradient(7deg, rgba(93,72,45,.045) 0 1px, transparent 1px 5px),
        repeating-linear-gradient(97deg, rgba(255,255,255,.05) 0 1px, transparent 1px 7px),
        radial-gradient(circle at 18% 24%, rgba(95,76,47,.08), transparent 26%),
        radial-gradient(circle at 77% 68%, rgba(117,91,55,.06), transparent 31%);
    }
    #map[data-mvp-map-skin="watercolor"] .mvp-map-skin-overlay { opacity: .075; }
  `;
  document.head.append(style);
}

function ensureOverlay(mapElement: HTMLElement): void {
  if (mapElement.querySelector('.mvp-map-skin-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'mvp-map-skin-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  mapElement.append(overlay);
}

function applySkinToInteractiveMap(skin: MvpMapSkin): void {
  const mapElement = document.querySelector<HTMLElement>('#map');
  if (!mapElement) return;
  ensureStyles();
  ensureOverlay(mapElement);
  mapElement.dataset.mvpMapSkin = skin.id;
}

function initMvpMapSkinUi(): void {
  const mapControls = document.querySelector<HTMLElement>('.map-controls');
  const routeAppearance = document.querySelector<HTMLSelectElement>('#routeAppearance');
  if (!mapControls || !routeAppearance || document.querySelector('#mvpMapSkin')) return;

  ensureStyles();
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
  hint.textContent = 'Experimental deterministic post-processing. No AI is used at runtime and map geometry is not changed.';

  const routeLabel = routeAppearance.closest('label');
  if (routeLabel) {
    routeLabel.before(label, hint);
  } else {
    mapControls.append(label, hint);
  }

  select.value = activeSkinId;
  select.addEventListener('change', () => setActiveMvpMapSkin(select.value));
  setActiveMvpMapSkin(select.value);
}

function makePaperPattern(context: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = 96;
  tile.height = 96;
  const tileContext = tile.getContext('2d');
  if (!tileContext) return null;

  // Deterministic pseudo-grain: fixed arithmetic, no Math.random().
  for (let y = 0; y < tile.height; y += 3) {
    for (let x = 0; x < tile.width; x += 3) {
      const value = (x * 37 + y * 61 + x * y * 3) % 29;
      if (value > 8) continue;
      const alpha = 0.018 + value * 0.0025;
      tileContext.fillStyle = `rgba(92, 70, 42, ${alpha})`;
      tileContext.fillRect(x, y, 1 + (value % 2), 1);
    }
  }
  return context.createPattern(tile, 'repeat');
}

export function applyActiveMvpMapSkinToCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const skin = getActiveMvpMapSkin();
  if (skin.id === 'none') return canvas;

  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext('2d');
  if (!context) return canvas;

  context.save();
  context.filter = skin.canvasFilter;
  context.drawImage(canvas, 0, 0);
  context.restore();

  const pattern = makePaperPattern(context);
  if (pattern && skin.overlayOpacity > 0) {
    context.save();
    context.globalAlpha = skin.overlayOpacity;
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = pattern;
    context.fillRect(0, 0, output.width, output.height);
    context.restore();
  }

  return output;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMvpMapSkinUi, { once: true });
  else queueMicrotask(initMvpMapSkinUi);
}
