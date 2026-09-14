import './styles.css';
import { flattenTrack, getPiecePoints } from '../editor/model';
import type { MapController } from '../map/mapController';
import { getBaseMapDefinition } from '../map/sources/baseMaps';
import type { AppState } from '../state/store';
import { downloadBlob, canvasToPngBlob } from './image';
import { getImageLayoutPreset, imageLayoutPresets, makeImageDimensions } from './layout';
import { renderMapImage } from './mapRenderer';
import {
  applyImageStylePreset,
  defaultImageExportSettings,
  groundCoverageMeters,
  imageStylePresets,
  mapScalePresets,
  type ImageExportSettings,
  type ImageExtentMode,
} from './settings';

export interface MapImageExportUiOptions {
  map: MapController;
  getState: () => AppState;
}

export interface MapImageExportUiHandle {
  getSettings(): ImageExportSettings;
  applySettings(settings: ImageExportSettings): void;
}

function formatGroundDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10_000 ? 1 : 2)} km` : `${Math.round(meters)} m`;
}

export function initMapImageExportUi(root: HTMLElement, options: MapImageExportUiOptions): MapImageExportUiHandle {
  const layoutOptions = imageLayoutPresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
  const styleOptions = imageStylePresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
  const scaleOptions = mapScalePresets.map((preset) => `<option value="${preset.denominator}">${preset.label}</option>`).join('');
  let settings = defaultImageExportSettings();

  root.innerHTML = `
    <h2>Map image</h2>
    <p class="hint">Create a publication-oriented PNG with project-specific composition settings.</p>
    <button class="secondary" data-image-export-open>Export map image</button>
    <dialog class="image-export-dialog">
      <form method="dialog" class="image-export-shell">
        <div class="image-export-head"><div><div class="eyebrow">PUBLICATION PNG</div><h3>Map image export</h3></div><button class="dialog-close" value="cancel" aria-label="Close">×</button></div>
        <div class="image-export-grid">
          <div class="image-export-controls">
            <label class="field-label">Publication style<select data-image-style>${styleOptions}</select></label>
            <p class="hint">Presets copy a reusable house style into this project. You can then change any setting independently.</p>

            <label class="field-label">Layout<select data-image-layout>${layoutOptions}<option value="custom">Custom</option></select></label>
            <div class="range-grid image-size-grid">
              <label>Width mm<input data-image-width type="number" min="10" max="1000" step="1"></label>
              <label>Height mm<input data-image-height type="number" min="10" max="1000" step="1"></label>
            </div>
            <label class="field-label">Resolution<select data-image-dpi><option value="150">150 dpi</option><option value="300">300 dpi</option><option value="450">450 dpi</option><option value="600">600 dpi</option></select></label>

            <details class="image-export-section" open>
              <summary>Map & route</summary>
              <div class="image-export-section-body">
                <div class="image-export-checks">
                  <label><input type="checkbox" data-image-base> Include current basemap</label>
                  <label><input type="checkbox" data-image-tracks> Imported tracks</label>
                  <label><input type="checkbox" data-image-combined> Combined route</label>
                  <label><input type="checkbox" data-image-markers> Start/end markers</label>
                </div>
                <label class="field-label">Extent<select data-image-fit>
                  <option value="route">Fit route automatically</option>
                  <option value="current">Use current export frame</option>
                  <option value="scale">Lock print scale</option>
                  <option value="zoom">Lock web zoom</option>
                </select></label>
                <label class="field-label" data-image-scale-row>Map scale<select data-image-map-scale>${scaleOptions}</select></label>
                <label class="field-label" data-image-zoom-row>Web zoom<input data-image-zoom type="number" min="0" max="24" step="0.25"></label>
                <p class="hint" data-image-extent-info></p>
                <label class="field-label">Route padding <span data-image-padding-label></span><input data-image-padding type="range" min="0" max="35" step="1"></label>
                <div class="image-style-grid">
                  <label>Route color<input data-image-route-color type="color"></label>
                  <label>Width px<input data-image-route-width type="number" min="1" max="30" step="0.5"></label>
                  <label>Opacity<input data-image-route-opacity type="number" min="0" max="1" step="0.05"></label>
                  <label>Background<input data-image-background type="color"></label>
                </div>
                <div class="image-export-checks">
                  <label><input type="checkbox" data-image-halo> Route halo</label>
                  <label><input type="checkbox" data-image-border> Border</label>
                </div>
                <div class="image-style-grid" data-image-halo-controls>
                  <label>Halo color<input data-image-halo-color type="color"></label>
                  <label>Halo width px<input data-image-halo-width type="number" min="1" max="40" step="0.5"></label>
                </div>
              </div>
            </details>

            <details class="image-export-section">
              <summary>Text & decorations</summary>
              <div class="image-export-section-body">
                <label class="field-label">Title<input data-image-title type="text" maxlength="120" placeholder="Optional title"></label>
                <label class="field-label">Subtitle<input data-image-subtitle type="text" maxlength="160" placeholder="Optional subtitle"></label>
                <label class="field-label">Caption<input data-image-caption type="text" maxlength="220" placeholder="Optional caption"></label>
                <div class="image-export-checks">
                  <label><input type="checkbox" data-image-scale> Scale bar</label>
                  <label><input type="checkbox" data-image-north> North arrow</label>
                </div>
              </div>
            </details>

            <div class="license-card" data-image-license></div>
            <p class="hint" data-image-dimensions></p>
            <button type="button" class="primary" data-image-render>Render image</button>
            <button type="button" class="secondary" data-image-download disabled>Download PNG</button>
          </div>
          <div class="image-export-preview">
            <div class="image-preview-placeholder" data-image-placeholder>Adjust the composition, then render a preview.</div>
            <div data-image-preview></div>
          </div>
        </div>
      </form>
    </dialog>`;

  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const openButton = root.querySelector<HTMLButtonElement>('[data-image-export-open]')!;
  const styleSelect = root.querySelector<HTMLSelectElement>('[data-image-style]')!;
  const layoutSelect = root.querySelector<HTMLSelectElement>('[data-image-layout]')!;
  const widthInput = root.querySelector<HTMLInputElement>('[data-image-width]')!;
  const heightInput = root.querySelector<HTMLInputElement>('[data-image-height]')!;
  const dpiSelect = root.querySelector<HTMLSelectElement>('[data-image-dpi]')!;
  const baseCheck = root.querySelector<HTMLInputElement>('[data-image-base]')!;
  const tracksCheck = root.querySelector<HTMLInputElement>('[data-image-tracks]')!;
  const combinedCheck = root.querySelector<HTMLInputElement>('[data-image-combined]')!;
  const markerCheck = root.querySelector<HTMLInputElement>('[data-image-markers]')!;
  const fitSelect = root.querySelector<HTMLSelectElement>('[data-image-fit]')!;
  const mapScaleSelect = root.querySelector<HTMLSelectElement>('[data-image-map-scale]')!;
  const zoomInput = root.querySelector<HTMLInputElement>('[data-image-zoom]')!;
  const scaleRow = root.querySelector<HTMLElement>('[data-image-scale-row]')!;
  const zoomRow = root.querySelector<HTMLElement>('[data-image-zoom-row]')!;
  const extentInfo = root.querySelector<HTMLElement>('[data-image-extent-info]')!;
  const paddingInput = root.querySelector<HTMLInputElement>('[data-image-padding]')!;
  const paddingLabel = root.querySelector<HTMLElement>('[data-image-padding-label]')!;
  const routeColor = root.querySelector<HTMLInputElement>('[data-image-route-color]')!;
  const routeWidth = root.querySelector<HTMLInputElement>('[data-image-route-width]')!;
  const routeOpacity = root.querySelector<HTMLInputElement>('[data-image-route-opacity]')!;
  const backgroundColor = root.querySelector<HTMLInputElement>('[data-image-background]')!;
  const haloCheck = root.querySelector<HTMLInputElement>('[data-image-halo]')!;
  const haloColor = root.querySelector<HTMLInputElement>('[data-image-halo-color]')!;
  const haloWidth = root.querySelector<HTMLInputElement>('[data-image-halo-width]')!;
  const borderCheck = root.querySelector<HTMLInputElement>('[data-image-border]')!;
  const titleInput = root.querySelector<HTMLInputElement>('[data-image-title]')!;
  const subtitleInput = root.querySelector<HTMLInputElement>('[data-image-subtitle]')!;
  const captionInput = root.querySelector<HTMLInputElement>('[data-image-caption]')!;
  const scaleCheck = root.querySelector<HTMLInputElement>('[data-image-scale]')!;
  const northCheck = root.querySelector<HTMLInputElement>('[data-image-north]')!;
  const licenseCard = root.querySelector<HTMLDivElement>('[data-image-license]')!;
  const dimensionsText = root.querySelector<HTMLParagraphElement>('[data-image-dimensions]')!;
  const renderButton = root.querySelector<HTMLButtonElement>('[data-image-render]')!;
  const downloadButton = root.querySelector<HTMLButtonElement>('[data-image-download]')!;
  const preview = root.querySelector<HTMLDivElement>('[data-image-preview]')!;
  const placeholder = root.querySelector<HTMLDivElement>('[data-image-placeholder]')!;
  let currentBlob: Blob | undefined;

  const capture = (): ImageExportSettings => ({
    presetId: styleSelect.value,
    layoutId: layoutSelect.value,
    widthMm: Number(widthInput.value),
    heightMm: Number(heightInput.value),
    dpi: Number(dpiSelect.value),
    includeBaseMap: baseCheck.checked,
    includeTracks: tracksCheck.checked,
    includeCombinedRoute: combinedCheck.checked,
    showScaleBar: scaleCheck.checked,
    showNorthArrow: northCheck.checked,
    fitMode: fitSelect.value as ImageExtentMode,
    scaleDenominator: Number(mapScaleSelect.value),
    zoomLevel: Number(zoomInput.value),
    paddingPercent: Number(paddingInput.value),
    backgroundColor: backgroundColor.value,
    border: borderCheck.checked,
    routeColor: routeColor.value,
    routeWidth: Number(routeWidth.value),
    routeOpacity: Number(routeOpacity.value),
    routeHalo: haloCheck.checked,
    routeHaloColor: haloColor.value,
    routeHaloWidth: Number(haloWidth.value),
    title: titleInput.value,
    subtitle: subtitleInput.value,
    caption: captionInput.value,
    showStartEndMarkers: markerCheck.checked,
  });

  const syncControls = () => {
    styleSelect.value = imageStylePresets.some((item) => item.id === settings.presetId) ? settings.presetId : imageStylePresets[0].id;
    layoutSelect.value = imageLayoutPresets.some((item) => item.id === settings.layoutId) ? settings.layoutId : 'custom';
    widthInput.value = String(settings.widthMm);
    heightInput.value = String(settings.heightMm);
    dpiSelect.value = String(settings.dpi);
    baseCheck.checked = settings.includeBaseMap;
    tracksCheck.checked = settings.includeTracks;
    combinedCheck.checked = settings.includeCombinedRoute;
    markerCheck.checked = settings.showStartEndMarkers;
    fitSelect.value = settings.fitMode;
    mapScaleSelect.value = String(settings.scaleDenominator);
    if (!Array.from(mapScaleSelect.options).some((option) => Number(option.value) === settings.scaleDenominator)) {
      mapScaleSelect.insertAdjacentHTML('beforeend', `<option value="${settings.scaleDenominator}">1:${settings.scaleDenominator.toLocaleString()} · custom</option>`);
      mapScaleSelect.value = String(settings.scaleDenominator);
    }
    zoomInput.value = String(settings.zoomLevel);
    paddingInput.value = String(settings.paddingPercent);
    routeColor.value = settings.routeColor;
    routeWidth.value = String(settings.routeWidth);
    routeOpacity.value = String(settings.routeOpacity);
    backgroundColor.value = settings.backgroundColor;
    haloCheck.checked = settings.routeHalo;
    haloColor.value = settings.routeHaloColor;
    haloWidth.value = String(settings.routeHaloWidth);
    borderCheck.checked = settings.border;
    titleInput.value = settings.title;
    subtitleInput.value = settings.subtitle;
    captionInput.value = settings.caption;
    scaleCheck.checked = settings.showScaleBar;
    northCheck.checked = settings.showNorthArrow;
  };

  const updateUi = () => {
    settings = capture();
    paddingLabel.textContent = `${settings.paddingPercent}%`;
    root.querySelector<HTMLElement>('[data-image-halo-controls]')!.hidden = !settings.routeHalo;
    paddingInput.disabled = settings.fitMode !== 'route';
    scaleRow.hidden = settings.fitMode !== 'scale';
    zoomRow.hidden = settings.fitMode !== 'zoom';
    routeColor.disabled = !settings.includeCombinedRoute;
    routeWidth.disabled = !settings.includeCombinedRoute;
    routeOpacity.disabled = !settings.includeCombinedRoute;
    haloCheck.disabled = !settings.includeCombinedRoute;
    markerCheck.disabled = !settings.includeCombinedRoute;

    try {
      const dimensions = makeImageDimensions(settings.widthMm, settings.heightMm, settings.dpi);
      let extentDescription = '';
      if (settings.fitMode === 'scale') {
        const ground = groundCoverageMeters(settings.widthMm, settings.heightMm, settings.scaleDenominator);
        extentDescription = ` · 1:${settings.scaleDenominator.toLocaleString()} covers ${formatGroundDistance(ground.width)} × ${formatGroundDistance(ground.height)}`;
        extentInfo.textContent = 'Locked print scale uses the current map center. Pan the map to reposition the export.';
      } else if (settings.fitMode === 'zoom') {
        extentDescription = ` · web zoom ${settings.zoomLevel}`;
        extentInfo.textContent = 'Locked web zoom reproduces the OpenLayers zoom level at the current map center; print scale still varies with latitude and DPI.';
      } else if (settings.fitMode === 'route') {
        extentInfo.textContent = 'The exporter fits the route and applies the selected padding.';
      } else {
        extentInfo.textContent = 'The current export frame determines the geographic extent.';
      }
      dimensionsText.textContent = `${dimensions.widthPx.toLocaleString()} × ${dimensions.heightPx.toLocaleString()} px · ${(dimensions.widthPx * dimensions.heightPx / 1_000_000).toFixed(1)} MP${extentDescription}`;
      options.map.setExportFrameAspect(dimensions.aspect);
    } catch (error) {
      dimensionsText.textContent = error instanceof Error ? error.message : String(error);
      renderButton.disabled = true;
      return;
    }

    const provider = getBaseMapDefinition(options.map.getBaseProviderId());
    if (!settings.includeBaseMap) {
      licenseCard.className = 'license-card safe';
      licenseCard.innerHTML = '<strong>Basemap excluded</strong><span>The export contains only project/route overlays. No basemap attribution is required by this exporter.</span>';
      renderButton.disabled = false;
      return;
    }

    if (provider.publicationExportPolicy === 'allowed-with-attribution') {
      licenseCard.className = 'license-card safe';
      licenseCard.innerHTML = `<strong>${provider.label}: publication export enabled</strong><span>${provider.publicationNotice}</span><span class="license-credit">Embedded credit: ${provider.publicationAttribution}</span>`;
      renderButton.disabled = false;
    } else {
      licenseCard.className = 'license-card warning';
      licenseCard.innerHTML = `<strong>${provider.label}: basemap export blocked</strong><span>${provider.publicationNotice}</span><span>Choose OpenStreetMap/OpenFreeMap or uncheck “Include current basemap”.</span>`;
      renderButton.disabled = true;
    }
  };

  const markCustomStyle = () => {
    settings = capture();
    settings.presetId = 'custom';
    styleSelect.value = imageStylePresets[0].id;
    updateUi();
    settings.presetId = 'custom';
  };

  styleSelect.addEventListener('change', () => {
    settings = applyImageStylePreset(capture(), styleSelect.value);
    syncControls();
    updateUi();
  });

  layoutSelect.addEventListener('change', () => {
    if (layoutSelect.value !== 'custom') {
      const preset = getImageLayoutPreset(layoutSelect.value);
      widthInput.value = String(preset.widthMm);
      heightInput.value = String(preset.heightMm);
      dpiSelect.value = String(preset.dpi);
    }
    updateUi();
  });
  widthInput.addEventListener('input', () => { layoutSelect.value = 'custom'; updateUi(); });
  heightInput.addEventListener('input', () => { layoutSelect.value = 'custom'; updateUi(); });
  dpiSelect.addEventListener('change', updateUi);

  [baseCheck, tracksCheck, combinedCheck, markerCheck, haloCheck, borderCheck, scaleCheck, northCheck].forEach((input) => input.addEventListener('change', updateUi));
  [fitSelect, mapScaleSelect].forEach((input) => input.addEventListener('change', updateUi));
  [paddingInput, routeWidth, routeOpacity, haloWidth, zoomInput].forEach((input) => input.addEventListener('input', updateUi));
  [routeColor, backgroundColor, haloColor].forEach((input) => input.addEventListener('input', markCustomStyle));
  [titleInput, subtitleInput, captionInput].forEach((input) => input.addEventListener('input', updateUi));

  openButton.addEventListener('click', () => {
    currentBlob = undefined;
    downloadButton.disabled = true;
    preview.replaceChildren();
    placeholder.hidden = false;
    syncControls();
    updateUi();
    dialog.showModal();
  });

  dialog.addEventListener('close', () => options.map.setExportFrameAspect(undefined));

  renderButton.addEventListener('click', async () => {
    try {
      settings = capture();
      renderButton.disabled = true;
      renderButton.textContent = 'Rendering…';
      const dimensions = makeImageDimensions(settings.widthMm, settings.heightMm, settings.dpi);
      const state = options.getState();
      const firstPiece = state.pieces[0];
      const lastPiece = state.pieces.at(-1);
      const firstPiecePoints = firstPiece ? getPiecePoints(firstPiece, state.tracks) : [];
      const lastPiecePoints = lastPiece ? getPiecePoints(lastPiece, state.tracks) : [];
      const selectedTrack = state.tracks.find((track) => track.id === state.selectedTrackId);
      const selectedPoints = selectedTrack ? flattenTrack(selectedTrack) : [];
      const routeStart = firstPiecePoints[0] ?? selectedPoints[0];
      const routeEnd = lastPiecePoints.at(-1) ?? selectedPoints.at(-1);

      const result = await renderMapImage(options.map, {
        dimensions,
        ...settings,
        routeStart,
        routeEnd,
      });
      currentBlob = await canvasToPngBlob(result.canvas);
      const displayCanvas = document.createElement('canvas');
      const maxWidth = 720;
      const scale = Math.min(1, maxWidth / result.canvas.width);
      displayCanvas.width = Math.round(result.canvas.width * scale);
      displayCanvas.height = Math.round(result.canvas.height * scale);
      const context = displayCanvas.getContext('2d');
      if (context) context.drawImage(result.canvas, 0, 0, displayCanvas.width, displayCanvas.height);
      preview.replaceChildren(displayCanvas);
      placeholder.hidden = true;
      downloadButton.disabled = false;
      if (settings.fitMode === 'zoom') {
        extentInfo.textContent = `Rendered at web zoom ${result.zoomLevel.toFixed(2)} · effective print scale about 1:${Math.round(result.scaleDenominator).toLocaleString()} at the map center.`;
      } else if (settings.fitMode === 'scale') {
        extentInfo.textContent = `Rendered at print scale 1:${Math.round(result.scaleDenominator).toLocaleString()} · web zoom ${result.zoomLevel.toFixed(2)} at the map center.`;
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      renderButton.textContent = 'Render image';
      updateUi();
    }
  });

  downloadButton.addEventListener('click', () => {
    if (!currentBlob) return;
    downloadBlob(`gpx-map-${new Date().toISOString().slice(0, 10)}.png`, currentBlob);
  });

  syncControls();
  updateUi();

  return {
    getSettings: () => ({ ...settings }),
    applySettings: (next) => {
      settings = { ...next };
      syncControls();
      updateUi();
    },
  };
}
