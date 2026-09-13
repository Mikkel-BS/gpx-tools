import { fromLonLat, getPointResolution } from 'ol/proj.js';
import type { GpxPoint } from '../gpx/types';
import type { MapController } from '../map/mapController';
import { getBaseMapDefinition } from '../map/sources/baseMaps';
import { drawExportDecorations } from './decorations';
import type { ImageExportDimensions } from './layout';

export interface MapImageRenderOptions {
  dimensions: ImageExportDimensions;
  includeBaseMap: boolean;
  includeTracks: boolean;
  includeCombinedRoute: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
  fitMode: 'current' | 'route';
  paddingPercent: number;
  backgroundColor: string;
  border: boolean;
  routeColor: string;
  routeWidth: number;
  routeOpacity: number;
  routeHalo: boolean;
  routeHaloColor: string;
  routeHaloWidth: number;
  title: string;
  subtitle: string;
  caption: string;
  showStartEndMarkers: boolean;
  routeStart?: GpxPoint;
  routeEnd?: GpxPoint;
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

function compositeRenderedMap(
  map: ReturnType<MapController['getMapForExport']>,
  width: number,
  height: number,
  backgroundColor: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas export is unavailable in this browser.');
  context.fillStyle = backgroundColor;
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

function drawTextBlock(context: CanvasRenderingContext2D, width: number, height: number, options: MapImageRenderOptions): void {
  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.025));
  context.save();
  context.textBaseline = 'top';
  context.fillStyle = '#171717';
  if (options.title.trim()) {
    context.font = `700 ${Math.max(22, Math.round(width * 0.024))}px system-ui, sans-serif`;
    context.fillText(options.title.trim(), margin, margin, width - margin * 2);
  }
  if (options.subtitle.trim()) {
    context.font = `500 ${Math.max(14, Math.round(width * 0.012))}px system-ui, sans-serif`;
    const y = margin + Math.max(30, Math.round(width * 0.032));
    context.fillText(options.subtitle.trim(), margin, y, width - margin * 2);
  }
  if (options.caption.trim()) {
    context.textBaseline = 'bottom';
    context.font = `400 ${Math.max(12, Math.round(width * 0.009))}px system-ui, sans-serif`;
    context.fillStyle = '#333333';
    context.fillText(options.caption.trim(), margin, height - margin, width - margin * 2);
  }
  context.restore();
}

function drawRouteMarker(context: CanvasRenderingContext2D, pixel: number[] | null, label: string, fill: string): void {
  if (!pixel) return;
  const [x, y] = pixel;
  context.save();
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = '#ffffff';
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = '700 11px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, x, y + 0.5);
  context.restore();
}

export async function renderMapImage(controller: MapController, options: MapImageRenderOptions): Promise<MapImageRenderResult> {
  const map = controller.getMapForExport();
  const view = map.getView();
  const provider = getBaseMapDefinition(controller.getBaseProviderId());
  const { widthPx, heightPx, aspect } = options.dimensions;
  const currentExtent = controller.getExportFrameExtent(aspect);

  if (options.includeBaseMap && provider.publicationExportPolicy !== 'allowed-with-attribution') {
    throw new Error('This basemap is not enabled for publication image export. Disable the basemap or choose a provider cleared for publication export.');
  }

  const originalSize = map.getSize();
  const originalCenter = view.getCenter()?.slice() as [number, number] | undefined;
  const originalResolution = view.getResolution();
  const originalRotation = view.getRotation();
  const visibility = {
    base: controller.getLayerVisibility('base'),
    tracks: controller.getLayerVisibility('tracks'),
    combined: controller.getLayerVisibility('combined'),
    selection: controller.getLayerVisibility('selection'),
  };

  try {
    controller.setLayerVisibility('base', options.includeBaseMap);
    controller.setLayerVisibility('tracks', options.includeTracks);
    controller.setLayerVisibility('combined', options.includeCombinedRoute);
    controller.setLayerVisibility('selection', false);
    controller.setExportRouteStyle(options.includeCombinedRoute ? {
      color: options.routeColor,
      width: options.routeWidth,
      opacity: options.routeOpacity,
      halo: options.routeHalo,
      haloColor: options.routeHaloColor,
      haloWidth: Math.max(options.routeHaloWidth, options.routeWidth),
    } : undefined);

    map.setSize([widthPx, heightPx]);
    if (options.fitMode === 'route') {
      const routeExtent = controller.getExportContentExtent(options.includeCombinedRoute);
      if (routeExtent) {
        const padX = Math.round(widthPx * Math.max(0, Math.min(0.35, options.paddingPercent / 100)));
        const padY = Math.round(heightPx * Math.max(0, Math.min(0.35, options.paddingPercent / 100)));
        view.fit(routeExtent, { size: [widthPx, heightPx], padding: [padY, padX, padY, padX], duration: 0 });
      } else {
        view.fit(currentExtent, { size: [widthPx, heightPx], padding: [0, 0, 0, 0], duration: 0 });
      }
    } else {
      view.fit(currentExtent, { size: [widthPx, heightPx], padding: [0, 0, 0, 0], duration: 0 });
    }

    await waitForRender(map);
    const canvas = compositeRenderedMap(map, widthPx, heightPx, options.backgroundColor);
    const center = view.getCenter();
    const resolution = view.getResolution() ?? 1;
    const metersPerPixel = center ? getPointResolution(view.getProjection(), resolution, center, 'm') : resolution;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas export is unavailable in this browser.');
    const attribution = options.includeBaseMap ? provider.publicationAttribution : undefined;

    if (options.showStartEndMarkers) {
      const startPixel = options.routeStart ? map.getPixelFromCoordinate(fromLonLat([options.routeStart.lon, options.routeStart.lat])) : null;
      const endPixel = options.routeEnd ? map.getPixelFromCoordinate(fromLonLat([options.routeEnd.lon, options.routeEnd.lat])) : null;
      drawRouteMarker(context, startPixel, 'S', '#18794e');
      drawRouteMarker(context, endPixel, 'E', '#b42318');
    }

    drawTextBlock(context, widthPx, heightPx, options);
    drawExportDecorations(context, widthPx, heightPx, metersPerPixel, {
      attribution,
      scaleBarMeters: options.showScaleBar ? metersPerPixel * widthPx * 0.18 : undefined,
      northArrow: options.showNorthArrow,
    });

    if (options.border) {
      context.save();
      context.strokeStyle = '#242421';
      context.lineWidth = Math.max(1, Math.round(Math.min(widthPx, heightPx) * 0.0015));
      const inset = context.lineWidth / 2;
      context.strokeRect(inset, inset, widthPx - context.lineWidth, heightPx - context.lineWidth);
      context.restore();
    }

    return { canvas, attribution, providerId: provider.id, metersPerPixel };
  } finally {
    controller.setExportRouteStyle(undefined);
    controller.setLayerVisibility('base', visibility.base);
    controller.setLayerVisibility('tracks', visibility.tracks);
    controller.setLayerVisibility('combined', visibility.combined);
    controller.setLayerVisibility('selection', visibility.selection);
    if (originalSize) map.setSize(originalSize);
    if (originalCenter) view.setCenter(originalCenter);
    if (originalResolution !== undefined) view.setResolution(originalResolution);
    view.setRotation(originalRotation);
    map.renderSync();
  }
}
