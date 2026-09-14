import { fromLonLat, getPointResolution } from 'ol/proj.js';
import type { GpxPoint, GpxSegment } from '../gpx/types';
import type { MapController } from '../map/mapController';
import { getBaseMapDefinition } from '../map/sources/baseMaps';
import { drawExportDecorations } from './decorations';
import { buildElevationProfile, type ElevationProfile } from './elevationProfile';
import type { ImageExportDimensions } from './layout';
import type { ImageExtentMode, ImageOutputMode, ProfileAxisMode, ProfileElevationRangeMode } from './settings';

export interface MapImageRenderOptions {
  dimensions: ImageExportDimensions;
  outputMode: ImageOutputMode;
  includeBaseMap: boolean;
  includeTracks: boolean;
  includeCombinedRoute: boolean;
  showScaleBar: boolean;
  showNorthArrow: boolean;
  fitMode: ImageExtentMode;
  scaleDenominator: number;
  zoomLevel: number;
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
  profileSegments?: GpxSegment[];
  profileHeightPercent: number;
  profileDistanceMode: ProfileAxisMode;
  profileDistanceMetersPerCm: number;
  profileElevationMode: ProfileAxisMode;
  profileElevationMetersPerCm: number;
  profileElevationRangeMode: ProfileElevationRangeMode;
  profileElevationMin: number;
  profileElevationMax: number;
}

export interface MapImageRenderResult {
  canvas: HTMLCanvasElement;
  attribution?: string;
  providerId: string;
  metersPerPixel: number;
  scaleDenominator: number;
  zoomLevel: number;
}

function canvasMatrix(transform: string): [number, number, number, number, number, number] {
  const match = transform.match(/^matrix\(([^)]+)\)$/);
  if (!match) return [1, 0, 0, 1, 0, 0];
  const values = match[1].split(',').map(Number);
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) return [1, 0, 0, 1, 0, 0];
  return values as [number, number, number, number, number, number];
}

function compositeRenderedMap(map: ReturnType<MapController['getMapForExport']>, width: number, height: number, backgroundColor: string): HTMLCanvasElement {
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
    const opacity = Number(parent?.style.opacity || layerCanvas.style.opacity || '1');
    context.globalAlpha = Number.isFinite(opacity) ? opacity : 1;
    context.setTransform(...canvasMatrix(layerCanvas.style.transform || ''));
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
    context.fillText(options.subtitle.trim(), margin, margin + Math.max(30, Math.round(width * 0.032)), width - margin * 2);
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

function applyLockedScale(view: ReturnType<ReturnType<MapController['getMapForExport']>['getView']>, center: [number, number], scaleDenominator: number, dpi: number): void {
  if (!Number.isFinite(scaleDenominator) || scaleDenominator <= 0) throw new Error('Map scale must be greater than zero.');
  const targetMetersPerPixel = scaleDenominator * 0.0254 / dpi;
  const metersPerProjectionPixel = getPointResolution(view.getProjection(), 1, center, 'm');
  if (!Number.isFinite(metersPerProjectionPixel) || metersPerProjectionPixel <= 0) throw new Error('Unable to calculate map scale at this location.');
  view.setCenter(center);
  view.setResolution(targetMetersPerPixel / metersPerProjectionPixel);
}

function niceStep(range: number, targetTicks = 5): number {
  if (!(range > 0)) return 1;
  const raw = range / targetTicks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}

function drawElevationProfile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  profile: ElevationProfile,
  options: MapImageRenderOptions,
): void {
  const marginLeft = Math.max(48, Math.round(width * 0.055));
  const marginRight = Math.max(18, Math.round(width * 0.025));
  const marginTop = Math.max(20, Math.round(height * 0.12));
  const marginBottom = Math.max(34, Math.round(height * 0.2));
  const graphX = x + marginLeft;
  const graphY = y + marginTop;
  const graphWidth = Math.max(1, width - marginLeft - marginRight);
  const graphHeight = Math.max(1, height - marginTop - marginBottom);
  const pxPerCm = options.dimensions.dpi / 2.54;

  const xScale = options.profileDistanceMode === 'scale'
    ? pxPerCm / options.profileDistanceMetersPerCm
    : graphWidth / Math.max(profile.totalDistanceMeters, 1);
  if (options.profileDistanceMode === 'scale' && profile.totalDistanceMeters * xScale > graphWidth + 0.5) {
    const capacityKm = graphWidth / xScale / 1000;
    throw new Error(`Locked profile distance scale does not fit this route. This panel holds ${capacityKm.toFixed(1)} km; choose a smaller scale or wider image.`);
  }

  let yMin: number;
  let yMax: number;
  let yScale: number;
  if (options.profileElevationRangeMode === 'fixed') {
    if (!(options.profileElevationMax > options.profileElevationMin)) throw new Error('Fixed elevation maximum must be greater than minimum.');
    yMin = options.profileElevationMin;
    yMax = options.profileElevationMax;
    if (profile.minElevationMeters < yMin || profile.maxElevationMeters > yMax) {
      throw new Error('The route elevation falls outside the fixed profile elevation range.');
    }
    yScale = graphHeight / (yMax - yMin);
  } else if (options.profileElevationMode === 'scale') {
    yScale = pxPerCm / options.profileElevationMetersPerCm;
    const coverage = graphHeight / yScale;
    const tick = niceStep(coverage, 5);
    yMin = Math.floor(profile.minElevationMeters / tick) * tick;
    yMax = yMin + coverage;
    if (profile.maxElevationMeters > yMax) {
      throw new Error('Locked profile elevation scale does not fit this route. Increase meters per cm or use automatic elevation fitting.');
    }
  } else {
    const rawRange = Math.max(1, profile.maxElevationMeters - profile.minElevationMeters);
    const pad = Math.max(10, rawRange * 0.08);
    yMin = profile.minElevationMeters - pad;
    yMax = profile.maxElevationMeters + pad;
    yScale = graphHeight / (yMax - yMin);
  }

  const pxX = (distance: number) => graphX + distance * xScale;
  const pxY = (elevation: number) => graphY + graphHeight - (elevation - yMin) * yScale;

  context.save();
  context.fillStyle = options.backgroundColor;
  context.fillRect(x, y, width, height);
  context.strokeStyle = 'rgba(36,36,33,.18)';
  context.lineWidth = 1;

  const yStep = niceStep(yMax - yMin, 4);
  const yStart = Math.ceil(yMin / yStep) * yStep;
  context.font = `${Math.max(10, Math.round(width * 0.008))}px system-ui, sans-serif`;
  context.fillStyle = '#5a5852';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (let elevation = yStart; elevation <= yMax + yStep * 0.01; elevation += yStep) {
    const py = pxY(elevation);
    context.beginPath();
    context.moveTo(graphX, py);
    context.lineTo(graphX + graphWidth, py);
    context.stroke();
    context.fillText(`${Math.round(elevation)} m`, graphX - 7, py);
  }

  const displayedDistance = options.profileDistanceMode === 'scale' ? graphWidth / xScale : profile.totalDistanceMeters;
  const xStep = niceStep(displayedDistance, 5);
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (let distance = 0; distance <= displayedDistance + xStep * 0.01; distance += xStep) {
    const px = pxX(distance);
    context.beginPath();
    context.moveTo(px, graphY + graphHeight);
    context.lineTo(px, graphY + graphHeight + 5);
    context.stroke();
    const label = distance >= 1000 ? `${(distance / 1000).toFixed(distance >= 10_000 ? 0 : 1)} km` : `${Math.round(distance)} m`;
    context.fillText(label, px, graphY + graphHeight + 8);
  }

  context.beginPath();
  context.rect(graphX, graphY, graphWidth, graphHeight);
  context.clip();
  context.strokeStyle = options.routeColor;
  context.globalAlpha = options.routeOpacity;
  context.lineWidth = Math.max(2, options.routeWidth * 0.65);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  for (const path of profile.paths) {
    if (!path.samples.length) continue;
    context.beginPath();
    path.samples.forEach((sample, index) => {
      const px = pxX(sample.distanceMeters);
      const py = pxY(sample.elevationMeters);
      if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
    });
    context.stroke();
  }
  context.globalAlpha = 1;

  context.strokeStyle = '#7b7770';
  context.lineWidth = 1;
  for (const distance of profile.breakDistancesMeters) {
    const px = pxX(distance);
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(px, graphY);
    context.lineTo(px, graphY + graphHeight);
    context.stroke();
  }
  context.setLineDash([]);
  context.restore();
}

export async function renderMapImage(controller: MapController, options: MapImageRenderOptions): Promise<MapImageRenderResult> {
  const map = controller.getMapForExport();
  const view = map.getView();
  const provider = getBaseMapDefinition(controller.getBaseProviderId());
  const { widthPx, heightPx } = options.dimensions;
  const profile = options.outputMode === 'map' ? undefined : buildElevationProfile(options.profileSegments ?? []);
  if (options.outputMode !== 'map' && !profile) throw new Error('No elevation values are available for the selected route.');

  const profileHeight = options.outputMode === 'profile'
    ? heightPx
    : options.outputMode === 'map-profile'
      ? Math.round(heightPx * Math.max(0.2, Math.min(0.6, options.profileHeightPercent / 100)))
      : 0;
  const mapHeight = options.outputMode === 'profile' ? 0 : heightPx - profileHeight;
  const mapAspect = mapHeight > 0 ? widthPx / mapHeight : options.dimensions.aspect;
  const currentExtent = controller.getExportFrameExtent(mapAspect);

  if (mapHeight > 0 && options.includeBaseMap && provider.publicationExportPolicy !== 'allowed-with-attribution') {
    throw new Error('This basemap is not enabled for publication image export. Disable the basemap or choose a provider cleared for publication export.');
  }

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = widthPx;
  finalCanvas.height = heightPx;
  const finalContext = finalCanvas.getContext('2d');
  if (!finalContext) throw new Error('Canvas export is unavailable in this browser.');
  finalContext.fillStyle = options.backgroundColor;
  finalContext.fillRect(0, 0, widthPx, heightPx);

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

  let metersPerPixel = 1;
  let effectiveScaleDenominator = options.scaleDenominator;
  let effectiveZoom = options.zoomLevel;
  const attribution = mapHeight > 0 && options.includeBaseMap ? provider.publicationAttribution : undefined;

  try {
    if (mapHeight > 0) {
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

      map.setSize([widthPx, mapHeight]);
      if (options.fitMode === 'route') {
        const routeExtent = controller.getExportContentExtent(options.includeCombinedRoute);
        if (routeExtent) {
          const padX = Math.round(widthPx * Math.max(0, Math.min(0.35, options.paddingPercent / 100)));
          const padY = Math.round(mapHeight * Math.max(0, Math.min(0.35, options.paddingPercent / 100)));
          view.fit(routeExtent, { size: [widthPx, mapHeight], padding: [padY, padX, padY, padX], duration: 0 });
        } else view.fit(currentExtent, { size: [widthPx, mapHeight], padding: [0, 0, 0, 0], duration: 0 });
      } else if (options.fitMode === 'scale') {
        if (!originalCenter) throw new Error('Map center is unavailable for locked-scale export.');
        applyLockedScale(view, originalCenter, options.scaleDenominator, options.dimensions.dpi);
      } else if (options.fitMode === 'zoom') {
        if (!originalCenter) throw new Error('Map center is unavailable for locked-zoom export.');
        if (!Number.isFinite(options.zoomLevel) || options.zoomLevel < 0 || options.zoomLevel > 24) throw new Error('Web zoom must be between 0 and 24.');
        view.setCenter(originalCenter);
        view.setZoom(options.zoomLevel);
      } else view.fit(currentExtent, { size: [widthPx, mapHeight], padding: [0, 0, 0, 0], duration: 0 });

      await waitForRender(map);
      const mapCanvas = compositeRenderedMap(map, widthPx, mapHeight, options.backgroundColor);
      const mapContext = mapCanvas.getContext('2d');
      if (!mapContext) throw new Error('Canvas export is unavailable in this browser.');
      const center = view.getCenter();
      const resolution = view.getResolution() ?? 1;
      metersPerPixel = center ? getPointResolution(view.getProjection(), resolution, center, 'm') : resolution;
      effectiveScaleDenominator = metersPerPixel * options.dimensions.dpi / 0.0254;
      effectiveZoom = view.getZoom() ?? options.zoomLevel;

      if (options.showStartEndMarkers) {
        drawRouteMarker(mapContext, options.routeStart ? map.getPixelFromCoordinate(fromLonLat([options.routeStart.lon, options.routeStart.lat])) : null, 'S', '#18794e');
        drawRouteMarker(mapContext, options.routeEnd ? map.getPixelFromCoordinate(fromLonLat([options.routeEnd.lon, options.routeEnd.lat])) : null, 'E', '#b42318');
      }
      drawExportDecorations(mapContext, widthPx, mapHeight, metersPerPixel, {
        attribution,
        scaleBarMeters: options.showScaleBar ? metersPerPixel * widthPx * 0.18 : undefined,
        northArrow: options.showNorthArrow,
      });
      finalContext.drawImage(mapCanvas, 0, 0);
    }

    if (profile) drawElevationProfile(finalContext, 0, mapHeight, widthPx, profileHeight, profile, options);
    drawTextBlock(finalContext, widthPx, heightPx, options);

    if (options.border) {
      finalContext.save();
      finalContext.strokeStyle = '#242421';
      finalContext.lineWidth = Math.max(1, Math.round(Math.min(widthPx, heightPx) * 0.0015));
      const inset = finalContext.lineWidth / 2;
      finalContext.strokeRect(inset, inset, widthPx - finalContext.lineWidth, heightPx - finalContext.lineWidth);
      finalContext.restore();
    }

    return { canvas: finalCanvas, attribution, providerId: provider.id, metersPerPixel, scaleDenominator: effectiveScaleDenominator, zoomLevel: effectiveZoom };
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
