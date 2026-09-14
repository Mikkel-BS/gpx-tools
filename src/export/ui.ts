import './styles.css';
import { buildCompositeSegments, flattenTrack, getPiecePoints } from '../editor/model';
import type { MapController } from '../map/mapController';
import { getBaseMapDefinition } from '../map/sources/baseMaps';
import type { AppState } from '../state/store';
import { buildElevationProfile } from './elevationProfile';
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
  type ImageOutputMode,
  type ProfileAxisMode,
  type ProfileElevationRangeMode,
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

function profileSegmentsForState(state: AppState) {
  if (state.pieces.length) return buildCompositeSegments(state.pieces, state.tracks);
  const selected = state.tracks.find((track) => track.id === state.selectedTrackId);
  return selected?.segments ?? [];
}

export function initMapImageExportUi(root: HTMLElement, options: MapImageExportUiOptions): MapImageExportUiHandle {
  const layoutOptions = imageLayoutPresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
  const styleOptions = imageStylePresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
  const scaleOptions = mapScalePresets.map((preset) => `<option value="${preset.denominator}">${preset.label}</option>`).join('');
  let settings = defaultImageExportSettings();

  root.innerHTML = `
    <h2>Map image</h2>
    <p class="hint">Create publication PNGs with reusable styling, reproducible map scale and optional elevation profile.</p>
    <button class="secondary" data-image-export-open>Export map image</button>
    <dialog class="image-export-dialog">
      <form method="dialog" class="image-export-shell">
        <div class="image-export-head"><div><div class="eyebrow">PUBLICATION PNG</div><h3>Map image export</h3></div><button class="dialog-close" value="cancel" aria-label="Close">×</button></div>
        <div class="image-export-grid">
          <div class="image-export-controls">
            <label class="field-label">Publication style<select data-image-style>${styleOptions}</select></label>
            <p class="hint">Presets copy a reusable house style into this project. You can then change any setting independently.</p>

            <label class="field-label">Output<select data-image-output>
              <option value="map">Map only</option>
              <option value="map-profile">Map + elevation profile</option>
              <option value="profile">Elevation profile only</option>
            </select></label>
            <label class="field-label">Layout<select data-image-layout>${layoutOptions}<option value="custom">Custom</option></select></label>
            <div class="range-grid image-size-grid">
              <label>Width mm<input data-image-width type="number" min="10" max="1000" step="1"></label>
              <label>Height mm<input data-image-height type="number" min="10" max="1000" step="1"></label>
            </div>
            <label class="field-label">Resolution<select data-image-dpi><option value="150">150 dpi</option><option value="300">300 dpi</option><option value="450">450 dpi</option><option value="600">600 dpi</option></select></label>

            <details class="image-export-section" open data-image-map-section>
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

            <details class="image-export-section" open data-image-profile-section>
              <summary>Elevation profile</summary>
              <div class="image-export-section-body">
                <label class="field-label" data-profile-height-row>Profile panel height <span data-profile-height-label></span><input data-profile-height type="range" min="20" max="60" step="1"></label>
                <div class="image-style-grid">
                  <label>Distance axis<select data-profile-distance-mode><option value="fit">Fit route</option><option value="scale">Lock scale</option></select></label>
                  <label data-profile-distance-scale-row>Meters / cm<input data-profile-distance-scale type="number" min="50" max="100000" step="50"></label>
                  <label>Elevation axis<select data-profile-elevation-mode><option value="fit">Fit elevations</option><option value="scale">Lock scale</option></select></label>
                  <label data-profile-elevation-scale-row>Meters / cm<input data-profile-elevation-scale type="number" min="10" max="10000" step="10"></label>
                </div>
                <label class="field-label">Elevation range<select data-profile-range-mode><option value="auto">Automatic baseline/range</option><option value="fixed">Fixed range for comparison</option></select></label>
                <div class="range-grid" data-profile-fixed-range>
                  <label>Minimum m<input data-profile-min type="number" min="-1000" max="10000" step="10"></label>
                  <label>Maximum m<input data-profile-max type="number" min="-1000" max="10000" step="10"></label>
                </div>
                <p class="hint" data-profile-info></p>
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

  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const dialog = q<HTMLDialogElement>('dialog');
  const openButton = q<HTMLButtonElement>('[data-image-export-open]');
  const styleSelect = q<HTMLSelectElement>('[data-image-style]');
  const outputSelect = q<HTMLSelectElement>('[data-image-output]');
  const layoutSelect = q<HTMLSelectElement>('[data-image-layout]');
  const widthInput = q<HTMLInputElement>('[data-image-width]');
  const heightInput = q<HTMLInputElement>('[data-image-height]');
  const dpiSelect = q<HTMLSelectElement>('[data-image-dpi]');
  const baseCheck = q<HTMLInputElement>('[data-image-base]');
  const tracksCheck = q<HTMLInputElement>('[data-image-tracks]');
  const combinedCheck = q<HTMLInputElement>('[data-image-combined]');
  const markerCheck = q<HTMLInputElement>('[data-image-markers]');
  const fitSelect = q<HTMLSelectElement>('[data-image-fit]');
  const mapScaleSelect = q<HTMLSelectElement>('[data-image-map-scale]');
  const zoomInput = q<HTMLInputElement>('[data-image-zoom]');
  const scaleRow = q<HTMLElement>('[data-image-scale-row]');
  const zoomRow = q<HTMLElement>('[data-image-zoom-row]');
  const extentInfo = q<HTMLElement>('[data-image-extent-info]');
  const paddingInput = q<HTMLInputElement>('[data-image-padding]');
  const paddingLabel = q<HTMLElement>('[data-image-padding-label]');
  const routeColor = q<HTMLInputElement>('[data-image-route-color]');
  const routeWidth = q<HTMLInputElement>('[data-image-route-width]');
  const routeOpacity = q<HTMLInputElement>('[data-image-route-opacity]');
  const backgroundColor = q<HTMLInputElement>('[data-image-background]');
  const haloCheck = q<HTMLInputElement>('[data-image-halo]');
  const haloColor = q<HTMLInputElement>('[data-image-halo-color]');
  const haloWidth = q<HTMLInputElement>('[data-image-halo-width]');
  const borderCheck = q<HTMLInputElement>('[data-image-border]');
  const titleInput = q<HTMLInputElement>('[data-image-title]');
  const subtitleInput = q<HTMLInputElement>('[data-image-subtitle]');
  const captionInput = q<HTMLInputElement>('[data-image-caption]');
  const scaleCheck = q<HTMLInputElement>('[data-image-scale]');
  const northCheck = q<HTMLInputElement>('[data-image-north]');
  const mapSection = q<HTMLElement>('[data-image-map-section]');
  const profileSection = q<HTMLElement>('[data-image-profile-section]');
  const profileHeightRow = q<HTMLElement>('[data-profile-height-row]');
  const profileHeight = q<HTMLInputElement>('[data-profile-height]');
  const profileHeightLabel = q<HTMLElement>('[data-profile-height-label]');
  const profileDistanceMode = q<HTMLSelectElement>('[data-profile-distance-mode]');
  const profileDistanceScaleRow = q<HTMLElement>('[data-profile-distance-scale-row]');
  const profileDistanceScale = q<HTMLInputElement>('[data-profile-distance-scale]');
  const profileElevationMode = q<HTMLSelectElement>('[data-profile-elevation-mode]');
  const profileElevationScaleRow = q<HTMLElement>('[data-profile-elevation-scale-row]');
  const profileElevationScale = q<HTMLInputElement>('[data-profile-elevation-scale]');
  const profileRangeMode = q<HTMLSelectElement>('[data-profile-range-mode]');
  const profileFixedRange = q<HTMLElement>('[data-profile-fixed-range]');
  const profileMin = q<HTMLInputElement>('[data-profile-min]');
  const profileMax = q<HTMLInputElement>('[data-profile-max]');
  const profileInfo = q<HTMLElement>('[data-profile-info]');
  const licenseCard = q<HTMLDivElement>('[data-image-license]');
  const dimensionsText = q<HTMLParagraphElement>('[data-image-dimensions]');
  const renderButton = q<HTMLButtonElement>('[data-image-render]');
  const downloadButton = q<HTMLButtonElement>('[data-image-download]');
  const preview = q<HTMLDivElement>('[data-image-preview]');
  const placeholder = q<HTMLDivElement>('[data-image-placeholder]');
  let currentBlob: Blob | undefined;

  const capture = (): ImageExportSettings => ({
    presetId: styleSelect.value,
    layoutId: layoutSelect.value,
    widthMm: Number(widthInput.value),
    heightMm: Number(heightInput.value),
    dpi: Number(dpiSelect.value),
    outputMode: outputSelect.value as ImageOutputMode,
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
    profileHeightPercent: Number(profileHeight.value),
    profileDistanceMode: profileDistanceMode.value as ProfileAxisMode,
    profileDistanceMetersPerCm: Number(profileDistanceScale.value),
    profileElevationMode: profileElevationMode.value as ProfileAxisMode,
    profileElevationMetersPerCm: Number(profileElevationScale.value),
    profileElevationRangeMode: profileRangeMode.value as ProfileElevationRangeMode,
    profileElevationMin: Number(profileMin.value),
    profileElevationMax: Number(profileMax.value),
  });

  const syncControls = () => {
    styleSelect.value = imageStylePresets.some((item) => item.id === settings.presetId) ? settings.presetId : imageStylePresets[0].id;
    outputSelect.value = settings.outputMode;
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
    profileHeight.value = String(settings.profileHeightPercent);
    profileDistanceMode.value = settings.profileDistanceMode;
    profileDistanceScale.value = String(settings.profileDistanceMetersPerCm);
    profileElevationMode.value = settings.profileElevationMode;
    profileElevationScale.value = String(settings.profileElevationMetersPerCm);
    profileRangeMode.value = settings.profileElevationRangeMode;
    profileMin.value = String(settings.profileElevationMin);
    profileMax.value = String(settings.profileElevationMax);
  };

  const updateUi = () => {
    settings = capture();
    let canRender = true;
    const hasMap = settings.outputMode !== 'profile';
    const hasProfile = settings.outputMode !== 'map';
    mapSection.hidden = !hasMap;
    profileSection.hidden = !hasProfile;
    profileHeightRow.hidden = settings.outputMode !== 'map-profile';
    profileHeightLabel.textContent = `${settings.profileHeightPercent}%`;
    paddingLabel.textContent = `${settings.paddingPercent}%`;
    q<HTMLElement>('[data-image-halo-controls]').hidden = !settings.routeHalo;
    paddingInput.disabled = settings.fitMode !== 'route';
    scaleRow.hidden = settings.fitMode !== 'scale';
    zoomRow.hidden = settings.fitMode !== 'zoom';
    profileDistanceScaleRow.hidden = settings.profileDistanceMode !== 'scale';
    profileElevationScaleRow.hidden = settings.profileElevationMode !== 'scale' || settings.profileElevationRangeMode === 'fixed';
    profileFixedRange.hidden = settings.profileElevationRangeMode !== 'fixed';
    routeColor.disabled = !settings.includeCombinedRoute && hasMap;
    routeWidth.disabled = !settings.includeCombinedRoute && hasMap;
    routeOpacity.disabled = !settings.includeCombinedRoute && hasMap;
    haloCheck.disabled = !settings.includeCombinedRoute && hasMap;
    markerCheck.disabled = !settings.includeCombinedRoute && hasMap;
    scaleCheck.disabled = !hasMap;
    northCheck.disabled = !hasMap;

    try {
      const dimensions = makeImageDimensions(settings.widthMm, settings.heightMm, settings.dpi);
      let extentDescription = '';
      if (hasMap && settings.fitMode === 'scale') {
        const mapHeightMm = settings.outputMode === 'map-profile' ? settings.heightMm * (1 - settings.profileHeightPercent / 100) : settings.heightMm;
        const ground = groundCoverageMeters(settings.widthMm, mapHeightMm, settings.scaleDenominator);
        extentDescription = ` · 1:${settings.scaleDenominator.toLocaleString()} covers ${formatGroundDistance(ground.width)} × ${formatGroundDistance(ground.height)}`;
        extentInfo.textContent = 'Locked print scale uses the current map center. Pan the map to reposition the export.';
      } else if (hasMap && settings.fitMode === 'zoom') {
        extentDescription = ` · web zoom ${settings.zoomLevel}`;
        extentInfo.textContent = 'Locked web zoom reproduces the OpenLayers zoom level at the current map center; print scale still varies with latitude and DPI.';
      } else if (hasMap && settings.fitMode === 'route') extentInfo.textContent = 'The exporter fits the route and applies the selected padding.';
      else if (hasMap) extentInfo.textContent = 'The current export frame determines the geographic extent.';

      dimensionsText.textContent = `${dimensions.widthPx.toLocaleString()} × ${dimensions.heightPx.toLocaleString()} px · ${(dimensions.widthPx * dimensions.heightPx / 1_000_000).toFixed(1)} MP${extentDescription}`;
      if (settings.outputMode === 'profile') options.map.setExportFrameAspect(undefined);
      else {
        const mapHeightPx = settings.outputMode === 'map-profile' ? dimensions.heightPx * (1 - settings.profileHeightPercent / 100) : dimensions.heightPx;
        options.map.setExportFrameAspect(dimensions.widthPx / mapHeightPx);
      }
    } catch (error) {
      dimensionsText.textContent = error instanceof Error ? error.message : String(error);
      canRender = false;
    }

    if (hasProfile) {
      const profile = buildElevationProfile(profileSegmentsForState(options.getState()));
      if (!profile) {
        profileInfo.textContent = 'No GPX elevation values are available for this route.';
        canRender = false;
      } else {
        const range = `${Math.round(profile.minElevationMeters)}–${Math.round(profile.maxElevationMeters)} m`;
        const locks: string[] = [];
        if (settings.profileDistanceMode === 'scale') locks.push(`horizontal ${formatGroundDistance(settings.profileDistanceMetersPerCm)} / cm`);
        if (settings.profileElevationRangeMode === 'fixed') locks.push(`vertical range ${settings.profileElevationMin}–${settings.profileElevationMax} m`);
        else if (settings.profileElevationMode === 'scale') locks.push(`vertical ${settings.profileElevationMetersPerCm} m / cm`);
        profileInfo.textContent = `${formatGroundDistance(profile.totalDistanceMeters)} recorded distance · elevation ${range} · ${profile.sourceSegmentCount} segment${profile.sourceSegmentCount === 1 ? '' : 's'}${locks.length ? ` · ${locks.join(' · ')}` : ''}. Segment boundaries are not bridged.`;
        if (settings.profileElevationRangeMode === 'fixed' && (!(settings.profileElevationMax > settings.profileElevationMin) || profile.minElevationMeters < settings.profileElevationMin || profile.maxElevationMeters > settings.profileElevationMax)) canRender = false;
      }
    }

    if (!hasMap || !settings.includeBaseMap) {
      licenseCard.className = 'license-card safe';
      licenseCard.innerHTML = hasMap
        ? '<strong>Basemap excluded</strong><span>The export contains only project/route overlays. No basemap attribution is required by this exporter.</span>'
        : '<strong>Profile-only export</strong><span>No basemap is rendered, so no basemap attribution is required.</span>';
    } else {
      const provider = getBaseMapDefinition(options.map.getBaseProviderId());
      if (provider.publicationExportPolicy === 'allowed-with-attribution') {
        licenseCard.className = 'license-card safe';
        licenseCard.innerHTML = `<strong>${provider.label}: publication export enabled</strong><span>${provider.publicationNotice}</span><span class="license-credit">Embedded credit: ${provider.publicationAttribution}</span>`;
      } else {
        licenseCard.className = 'license-card warning';
        licenseCard.innerHTML = `<strong>${provider.label}: basemap export blocked</strong><span>${provider.publicationNotice}</span><span>Choose OpenStreetMap/OpenFreeMap or uncheck “Include current basemap”.</span>`;
        canRender = false;
      }
    }
    renderButton.disabled = !canRender;
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
  [outputSelect, fitSelect, mapScaleSelect, profileDistanceMode, profileElevationMode, profileRangeMode].forEach((input) => input.addEventListener('change', updateUi));
  [paddingInput, routeWidth, routeOpacity, haloWidth, zoomInput, profileHeight, profileDistanceScale, profileElevationScale, profileMin, profileMax].forEach((input) => input.addEventListener('input', updateUi));
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
      const profileSegments = profileSegmentsForState(state);

      const result = await renderMapImage(options.map, { dimensions, ...settings, routeStart, routeEnd, profileSegments });
      currentBlob = await canvasToPngBlob(result.canvas);
      const displayCanvas = document.createElement('canvas');
      const scale = Math.min(1, 720 / result.canvas.width);
      displayCanvas.width = Math.round(result.canvas.width * scale);
      displayCanvas.height = Math.round(result.canvas.height * scale);
      displayCanvas.getContext('2d')?.drawImage(result.canvas, 0, 0, displayCanvas.width, displayCanvas.height);
      preview.replaceChildren(displayCanvas);
      placeholder.hidden = true;
      downloadButton.disabled = false;
      if (settings.outputMode !== 'profile' && settings.fitMode === 'zoom') extentInfo.textContent = `Rendered at web zoom ${result.zoomLevel.toFixed(2)} · effective print scale about 1:${Math.round(result.scaleDenominator).toLocaleString()} at the map center.`;
      else if (settings.outputMode !== 'profile' && settings.fitMode === 'scale') extentInfo.textContent = `Rendered at print scale 1:${Math.round(result.scaleDenominator).toLocaleString()} · web zoom ${result.zoomLevel.toFixed(2)} at the map center.`;
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      renderButton.textContent = 'Render image';
      updateUi();
    }
  });

  downloadButton.addEventListener('click', () => {
    if (currentBlob) downloadBlob(`gpx-map-${new Date().toISOString().slice(0, 10)}.png`, currentBlob);
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
