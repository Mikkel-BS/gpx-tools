import type { MapController } from '../map/mapController';
import { getRasterProvider } from '../map/sources/providers';
import { downloadBlob, canvasToPngBlob } from './image';
import { getImageLayoutPreset, imageLayoutPresets, makeImageDimensions } from './layout';
import { renderMapImage } from './mapRenderer';

export interface MapImageExportUiOptions {
  map: MapController;
}

export function initMapImageExportUi(root: HTMLElement, options: MapImageExportUiOptions): void {
  const presetOptions = imageLayoutPresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
  root.innerHTML = `
    <h2>Map image</h2>
    <p class="hint">Create a publication-oriented PNG from the current map composition.</p>
    <button class="secondary" data-image-export-open>Export map image</button>
    <dialog class="image-export-dialog">
      <form method="dialog" class="image-export-shell">
        <div class="image-export-head"><div><div class="eyebrow">PUBLICATION PNG</div><h3>Map image export</h3></div><button class="dialog-close" value="cancel" aria-label="Close">×</button></div>
        <div class="image-export-grid">
          <div class="image-export-controls">
            <label class="field-label">Layout<select data-image-layout>${presetOptions}<option value="custom">Custom</option></select></label>
            <div class="range-grid image-size-grid">
              <label>Width mm<input data-image-width type="number" min="10" max="1000" step="1"></label>
              <label>Height mm<input data-image-height type="number" min="10" max="1000" step="1"></label>
            </div>
            <label class="field-label">Resolution<select data-image-dpi><option value="150">150 dpi</option><option value="300" selected>300 dpi</option><option value="450">450 dpi</option><option value="600">600 dpi</option></select></label>
            <div class="image-export-checks">
              <label><input type="checkbox" data-image-base checked> Include current basemap</label>
              <label><input type="checkbox" data-image-scale checked> Scale bar</label>
              <label><input type="checkbox" data-image-north> North arrow</label>
            </div>
            <div class="license-card" data-image-license></div>
            <p class="hint" data-image-dimensions></p>
            <button type="button" class="primary" data-image-render>Render image</button>
            <button type="button" class="secondary" data-image-download disabled>Download PNG</button>
          </div>
          <div class="image-export-preview">
            <div class="image-preview-placeholder" data-image-placeholder>Position the map inside the frame, then render.</div>
            <div data-image-preview></div>
          </div>
        </div>
      </form>
    </dialog>`;

  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const openButton = root.querySelector<HTMLButtonElement>('[data-image-export-open]')!;
  const layoutSelect = root.querySelector<HTMLSelectElement>('[data-image-layout]')!;
  const widthInput = root.querySelector<HTMLInputElement>('[data-image-width]')!;
  const heightInput = root.querySelector<HTMLInputElement>('[data-image-height]')!;
  const dpiSelect = root.querySelector<HTMLSelectElement>('[data-image-dpi]')!;
  const baseCheck = root.querySelector<HTMLInputElement>('[data-image-base]')!;
  const scaleCheck = root.querySelector<HTMLInputElement>('[data-image-scale]')!;
  const northCheck = root.querySelector<HTMLInputElement>('[data-image-north]')!;
  const licenseCard = root.querySelector<HTMLDivElement>('[data-image-license]')!;
  const dimensionsText = root.querySelector<HTMLParagraphElement>('[data-image-dimensions]')!;
  const renderButton = root.querySelector<HTMLButtonElement>('[data-image-render]')!;
  const downloadButton = root.querySelector<HTMLButtonElement>('[data-image-download]')!;
  const preview = root.querySelector<HTMLDivElement>('[data-image-preview]')!;
  const placeholder = root.querySelector<HTMLDivElement>('[data-image-placeholder]')!;
  let currentBlob: Blob | undefined;

  const applyPreset = () => {
    if (layoutSelect.value !== 'custom') {
      const preset = getImageLayoutPreset(layoutSelect.value);
      widthInput.value = String(preset.widthMm);
      heightInput.value = String(preset.heightMm);
      dpiSelect.value = String(preset.dpi);
    }
    updateUi();
  };

  const updateUi = () => {
    let dimensions;
    try {
      dimensions = makeImageDimensions(Number(widthInput.value), Number(heightInput.value), Number(dpiSelect.value));
      dimensionsText.textContent = `${dimensions.widthPx.toLocaleString()} × ${dimensions.heightPx.toLocaleString()} px · ${(dimensions.widthPx * dimensions.heightPx / 1_000_000).toFixed(1)} MP`;
      options.map.setExportFrameAspect(dimensions.aspect);
    } catch (error) {
      dimensionsText.textContent = error instanceof Error ? error.message : String(error);
      renderButton.disabled = true;
      return;
    }

    const provider = getRasterProvider(options.map.getBaseProviderId());
    const includeBase = baseCheck.checked;
    if (!includeBase) {
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
      licenseCard.innerHTML = `<strong>${provider.label}: basemap export blocked</strong><span>${provider.publicationNotice}</span><span>Switch to OpenStreetMap or uncheck “Include current basemap”.</span>`;
      renderButton.disabled = true;
    }
  };

  openButton.addEventListener('click', () => {
    const preset = getImageLayoutPreset(layoutSelect.value);
    widthInput.value ||= String(preset.widthMm);
    heightInput.value ||= String(preset.heightMm);
    baseCheck.checked = options.map.getLayerVisibility('base');
    currentBlob = undefined;
    downloadButton.disabled = true;
    preview.replaceChildren();
    placeholder.hidden = false;
    updateUi();
    dialog.showModal();
  });

  dialog.addEventListener('close', () => options.map.setExportFrameAspect(undefined));
  layoutSelect.addEventListener('change', applyPreset);
  widthInput.addEventListener('input', () => { layoutSelect.value = 'custom'; updateUi(); });
  heightInput.addEventListener('input', () => { layoutSelect.value = 'custom'; updateUi(); });
  dpiSelect.addEventListener('change', updateUi);
  baseCheck.addEventListener('change', updateUi);

  renderButton.addEventListener('click', async () => {
    try {
      renderButton.disabled = true;
      renderButton.textContent = 'Rendering…';
      const dimensions = makeImageDimensions(Number(widthInput.value), Number(heightInput.value), Number(dpiSelect.value));
      const result = await renderMapImage(options.map, {
        dimensions,
        includeBaseMap: baseCheck.checked,
        showScaleBar: scaleCheck.checked,
        showNorthArrow: northCheck.checked,
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

  applyPreset();
}
