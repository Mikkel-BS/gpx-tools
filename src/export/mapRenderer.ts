import { getPointResolution } from 'ol/proj.js';
import type { MapController } from '../map/mapController';
import { getRasterProvider } from '../map/sources/providers';
import { drawExportDecorations } from './decorations';
import type { ImageExportDimensions } from './layout';

export interface MapImageRenderOptions {
  dimensions: ImageExportDimensions;
  includeBaseMap: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
}

export interface MapImageRenderResult {
  canvas: HTMLCanvasElement;
  attribution?: string;
  providerId: string;
  metersPerPixel: number;
}

function canvasMatrix(transform: string): [number, number, number, number, number, number] {
  const match = transform.match(/^matrix\(([^)]+)\)$/);
  if (!match) return [1, 0, 0, 1, 0, 0];
  const values = match[1].split(',').map(Number);
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return [1, 0, 0, 1, 0, 0];
  return values as [number, number, number, number, number, number];
}

function compositeRenderedMap(map: ReturnType<MapController['getMapForExport']>, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas export is unavailable in this browser.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);

  const layerCanvases = map.getViewport().querySelectorAll<HTMLCanvasElement>('.ol-layer canvas, canvas.ol-layer');
  for (const layerCanvas of layerCanvases) {
    if (!layerCanvas.width || !layerCanvas.height) continue;
    const parent = layerCanvas.parentElement;
    const opacityText = parent?.style.opacity || layerCanvas.style.opacity || '1';
    const opacity = Number(opacityText);
    context.globalAlpha = Number.isFinite(opacity) ? opacity : 1;
    const transform = canvasMatrix(layerCanvas.style.transform || '');
    context.setTransform(...transform);
    const background = parent?.style.backgroundColor || layerCanvas.style.backgroundColor;
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, layerCanvas.width, layerCanvas.height);
    }
    context.drawImage(layerCanvas, 0, 0);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  return canvas;
}

function waitForRender(map: ReturnType<MapController['getMapForExport']>): Promise<void> {
  return new Promise((resolve) => {
    map.once('rendercomplete', () => resolve());
    map.renderSync();
  });
}

export async function renderMapImage(controller: MapController, options: MapImageRenderOptions): Promise<MapImageRenderResult> {
  const map = controller.getMapForExport();
  const view = map.getView();
  const provider = getRasterProvider(controller.getBaseProviderId());
  const { widthPx, heightPx, aspect } = options.dimensions;
  const exportExtent = controller.getExportFrameExtent(aspect);

  if (options.includeBaseMap && provider.publicationExportPolicy !== 'allowed-with-attribution') {
    throw new Error('This basemap is not enabled for publication image export. Disable the basemap or choose a provider cleared for publication export.');
  }

  const originalSize = map.getSize();
  const originalCenter = view.getCenter()?.slice() as [number, number] | undefined;
  const originalResolution = view.getResolution();
  const originalRotation = view.getRotation();
  const originalBaseVisible = controller.getLayerVisibility('base');

  try {
    controller.setLayerVisibility('base', options.includeBaseMap);
    map.setSize([widthPx, heightPx]);
    view.fit(exportExtent, { size: [widthPx, heightPx], padding: [0, 0, 0, 0], duration: 0 });
    await waitForRender(map);
    const canvas = compositeRenderedMap(map, widthPx, heightPx);
    const center = view.getCenter();
    const resolution = view.getResolution() ?? 1;
    const metersPerPixel = center ? getPointResolution(view.getProjection(), resolution, center, 'm') : resolution;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas export is unavailable in this browser.');
    const attribution = options.includeBaseMap ? provider.publicationAttribution : undefined;
    drawExportDecorations(context, widthPx, heightPx, metersPerPixel, {
      attribution,
      scaleBarMeters: options.showScaleBar ? metersPerPixel * widthPx * 0.18 : undefined,
      northArrow: options.showNorthArrow,
    });
    return { canvas, attribution, providerId: provider.id, metersPerPixel };
  } finally {
    controller.setLayerVisibility('base', originalBaseVisible);
    if (originalSize) map.setSize(originalSize);
    if (originalCenter) view.setCenter(originalCenter);
    if (originalResolution !== undefined) view.setResolution(originalResolution);
    view.setRotation(originalRotation);
    map.renderSync();
  }
}
