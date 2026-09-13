import Map from 'ol/Map.js';
import View from 'ol/View.js';
import LayerGroup from 'ol/layer/Group.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import Point from 'ol/geom/Point.js';
import Translate from 'ol/interaction/Translate.js';
import { fromLonLat } from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import type { Coordinate } from 'ol/coordinate.js';
import { apply } from 'ol-mapbox-style';
import { flattenTrack, getPiecePoints, indicesShareSegment, type RoutePiece } from '../editor/model';
import type { GpxPoint, GpxTrack } from '../gpx/types';
import { getBaseMapDefinition } from './sources/baseMaps';
import { getRasterProvider, rasterProviders } from './sources/providers';
import { loadVectorStyle } from './sources/vectorStyles';
import { getRouteAppearancePreset, type RouteAppearancePreset } from './styles/presets';

type SelectionHandle = 'start' | 'end';
export type MapLayerId = 'base' | 'tracks' | 'combined' | 'selection';

export interface ExportRouteStyle {
  color: string;
  width: number;
  opacity: number;
  halo: boolean;
  haloColor: string;
  haloWidth: number;
}

export class MapController {
  private map: Map;
  private target: HTMLElement;
  private trackLayer: VectorLayer<VectorSource>;
  private selectionLayer: VectorLayer<VectorSource>;
  private compositeLayer: VectorLayer<VectorSource>;
  private ntr1PreviewLayer: VectorLayer<VectorSource>;
  private baseGroup: LayerGroup;
  private selectionTrack?: GpxTrack;
  private selectionProjected: Coordinate[] = [];
  private selectionChangeHandler?: (handle: SelectionHandle, index: number) => void;
  private trackSignature = '';
  private routeAppearance: RouteAppearancePreset = getRouteAppearancePreset('book-light');
  private exportRouteStyle?: ExportRouteStyle;
  private baseProviderId = rasterProviders[0].id;
  private baseRequestToken = 0;
  private exportFrame: HTMLDivElement;
  private exportFrameAspect?: number;
  private exportFramePixelSize?: [number, number];
  private resizeObserver?: ResizeObserver;

  constructor(target: HTMLElement) {
    this.target = target;
    const initialRaster = this.makeRasterLayer(this.baseProviderId);
    this.baseGroup = new LayerGroup({ layers: [initialRaster], zIndex: 0 });
    this.trackLayer = new VectorLayer({ source: new VectorSource(), zIndex: 10 });
    this.compositeLayer = new VectorLayer({ source: new VectorSource(), zIndex: 20 });
    this.ntr1PreviewLayer = new VectorLayer({ source: new VectorSource(), zIndex: 25 });
    this.selectionLayer = new VectorLayer({ source: new VectorSource(), zIndex: 30 });
    this.map = new Map({
      target,
      layers: [this.baseGroup, this.trackLayer, this.compositeLayer, this.ntr1PreviewLayer, this.selectionLayer],
      view: new View({ center: fromLonLat([10.75, 59.91]), zoom: 8 }),
    });

    this.exportFrame = document.createElement('div');
    this.exportFrame.className = 'map-export-frame';
    this.exportFrame.hidden = true;
    this.target.append(this.exportFrame);
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.updateExportFrame());
      this.resizeObserver.observe(this.target);
    }

    const translate = new Translate({
      layers: [this.selectionLayer],
      hitTolerance: 14,
      filter: (feature) => Boolean(feature.get('selectionHandle')),
    });
    translate.on('translateend', (event) => {
      const feature = event.features.item(0);
      const handle = feature?.get('selectionHandle') as SelectionHandle | undefined;
      const geometry = feature?.getGeometry();
      if (!handle || !(geometry instanceof Point) || !this.selectionTrack) return;
      const index = this.nearestSelectionIndex(geometry.getCoordinates());
      this.selectionChangeHandler?.(handle, index);
    });
    this.map.addInteraction(translate);
  }

  onSelectionChange(handler: (handle: SelectionHandle, index: number) => void): void {
    this.selectionChangeHandler = handler;
  }

  async setBaseProvider(providerId: string): Promise<void> {
    const provider = getBaseMapDefinition(providerId);
    const requestToken = ++this.baseRequestToken;
    const visible = this.baseGroup.getVisible();
    const opacity = this.baseGroup.getOpacity();

    if (provider.kind === 'raster') {
      const layer = this.makeRasterLayer(provider.id);
      const group = new LayerGroup({ layers: [layer], zIndex: 0, visible, opacity });
      this.replaceBaseGroup(group);
      this.baseProviderId = provider.id;
      this.target.style.background = '#e4e5df';
      this.map.render();
      return;
    }

    const style = await loadVectorStyle(provider);
    if (requestToken !== this.baseRequestToken) return;
    const group = new LayerGroup({ zIndex: 0, visible, opacity });
    await apply(group, style);
    if (requestToken !== this.baseRequestToken) return;
    this.replaceBaseGroup(group);
    this.baseProviderId = provider.id;
    this.target.style.background = '#e4e5df';
    this.map.render();
  }

  getBaseProviderId(): string { return this.baseProviderId; }
  getMapForExport(): Map { return this.map; }

  setLayerVisibility(layerId: MapLayerId, visible: boolean): void {
    this.getLayer(layerId).setVisible(visible);
  }

  getLayerVisibility(layerId: MapLayerId): boolean {
    return this.getLayer(layerId).getVisible();
  }

  setLayerOpacity(layerId: MapLayerId, opacity: number): void {
    this.getLayer(layerId).setOpacity(Math.max(0, Math.min(1, opacity)));
  }

  getLayerOpacity(layerId: MapLayerId): number {
    return this.getLayer(layerId).getOpacity();
  }

  setExportRouteStyle(style?: ExportRouteStyle): void {
    this.exportRouteStyle = style;
    this.restyleComposite();
  }

  getExportContentExtent(preferCombined = true): [number, number, number, number] | undefined {
    const source = preferCombined && this.compositeLayer.getSource()?.getFeatures().length
      ? this.compositeLayer.getSource()
      : this.trackLayer.getSource();
    if (!source || !source.getFeatures().length) return undefined;
    const extent = source.getExtent();
    if (!extent || !extent.every(Number.isFinite)) return undefined;
    return [extent[0], extent[1], extent[2], extent[3]];
  }

  setExportFrameAspect(aspect?: number): void {
    this.exportFrameAspect = aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : undefined;
    this.updateExportFrame();
  }

  getExportFrameExtent(aspect: number): [number, number, number, number] {
    if (this.exportFrameAspect !== aspect || !this.exportFramePixelSize) {
      this.exportFrameAspect = aspect;
      this.updateExportFrame();
    }
    const view = this.map.getView();
    const center = view.getCenter();
    const resolution = view.getResolution();
    const mapSize = this.map.getSize();
    if (!center || !resolution || !mapSize) {
      const extent = view.calculateExtent(mapSize);
      return [extent[0], extent[1], extent[2], extent[3]];
    }
    const [frameWidth, frameHeight] = this.exportFramePixelSize ?? mapSize;
    const halfWidth = resolution * frameWidth / 2;
    const halfHeight = resolution * frameHeight / 2;
    return [center[0] - halfWidth, center[1] - halfHeight, center[0] + halfWidth, center[1] + halfHeight];
  }

  setRouteAppearance(presetId: string): RouteAppearancePreset {
    this.routeAppearance = getRouteAppearancePreset(presetId);
    this.restyleTracks();
    this.restyleComposite();
    this.restyleSelection();
    return this.routeAppearance;
  }

  setTracks(tracks: GpxTrack[], selectedTrackId?: string): void {
    const source = this.trackLayer.getSource();
    if (!source) return;
    source.clear();
    tracks.forEach((track, index) => {
      const lines = track.segments.map((segment) => segment.points.map((point) => fromLonLat([point.lon, point.lat])));
      const feature = new Feature(new MultiLineString(lines));
      feature.setId(track.id);
      feature.set('paletteIndex', index);
      feature.set('selectedTrack', track.id === selectedTrackId);
      source.addFeature(feature);
    });
    this.restyleTracks();

    const signature = tracks.map((track) => track.id).join('|');
    if (tracks.length && signature !== this.trackSignature) {
      const extent = source.getExtent();
      if (extent && extent.every(Number.isFinite)) {
        this.map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 15, duration: 250 });
      }
    }
    this.trackSignature = signature;
  }

  setSelection(track: GpxTrack | undefined, startIndex: number, endIndex: number): void {
    const source = this.selectionLayer.getSource();
    if (!source) return;
    source.clear();
    this.selectionTrack = track;
    this.selectionProjected = [];
    if (!track) return;

    const points = flattenTrack(track);
    if (!points.length) return;
    this.selectionProjected = points.map((point) => fromLonLat([point.lon, point.lat]));
    const start = Math.max(0, Math.min(points.length - 1, Math.round(startIndex)));
    const end = Math.max(0, Math.min(points.length - 1, Math.round(endIndex)));
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);

    if (hi > lo && indicesShareSegment(track, start, end)) {
      const halo = new Feature(new LineString(this.selectionProjected.slice(lo, hi + 1)));
      halo.set('selectionRole', 'halo');
      const inner = new Feature(new LineString(this.selectionProjected.slice(lo, hi + 1)));
      inner.set('selectionRole', 'inner');
      source.addFeatures([halo, inner]);
    }

    source.addFeatures([
      this.makeHandle(this.selectionProjected[start], 'start', '#18794e'),
      this.makeHandle(this.selectionProjected[end], 'end', '#b42318'),
    ]);
    this.restyleSelection();
  }

  setComposite(pieces: RoutePiece[], tracks: GpxTrack[], selectedPieceId?: string): void {
    const source = this.compositeLayer.getSource();
    if (!source) return;
    source.clear();
    for (const piece of pieces) {
      const points = getPiecePoints(piece, tracks);
      if (points.length < 2) continue;
      const feature = new Feature(new LineString(points.map((point) => fromLonLat([point.lon, point.lat]))));
      feature.setId(piece.id);
      feature.set('selectedPiece', piece.id === selectedPieceId);
      source.addFeature(feature);
    }
    this.restyleComposite();
  }

  setNtr1Preview(points?: GpxPoint[]): void {
    const source = this.ntr1PreviewLayer.getSource();
    if (!source) return;
    source.clear();
    if (!points || points.length < 2) return;
    const feature = new Feature(new LineString(points.map((point) => fromLonLat([point.lon, point.lat]))));
    feature.setStyle(new Style({
      stroke: new Stroke({ color: '#008a9a', width: 4, lineDash: [10, 7] }),
    }));
    source.addFeature(feature);
  }

  private replaceBaseGroup(group: LayerGroup): void {
    this.map.getLayers().setAt(0, group);
    this.baseGroup = group;
  }

  private updateExportFrame(): void {
    const aspect = this.exportFrameAspect;
    if (!aspect) {
      this.exportFrame.hidden = true;
      this.exportFramePixelSize = undefined;
      return;
    }
    const rect = this.target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const maxWidth = rect.width * 0.84;
    const maxHeight = rect.height * 0.84;
    let width = maxWidth;
    let height = width / aspect;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspect;
    }
    this.exportFramePixelSize = [width, height];
    this.exportFrame.style.width = `${width}px`;
    this.exportFrame.style.height = `${height}px`;
    this.exportFrame.hidden = false;
  }

  private makeRasterLayer(providerId: string): TileLayer<XYZ> {
    return new TileLayer({ source: this.makeRasterSource(providerId), zIndex: 0 });
  }

  private makeRasterSource(providerId: string): XYZ {
    const provider = getRasterProvider(providerId);
    return new XYZ({
      url: provider.url,
      attributions: provider.attribution,
      maxZoom: provider.maxZoom,
      crossOrigin: 'anonymous',
    });
  }

  private getLayer(layerId: MapLayerId): LayerGroup | VectorLayer<VectorSource> {
    if (layerId === 'base') return this.baseGroup;
    if (layerId === 'tracks') return this.trackLayer;
    if (layerId === 'combined') return this.compositeLayer;
    return this.selectionLayer;
  }

  private restyleTracks(): void {
    const source = this.trackLayer.getSource();
    if (!source) return;
    for (const feature of source.getFeatures()) {
      const index = Number(feature.get('paletteIndex') ?? 0);
      const selected = Boolean(feature.get('selectedTrack'));
      const colors = this.routeAppearance.trackColors.length ? this.routeAppearance.trackColors : ['#444444'];
      const color = colors[index % colors.length];
      feature.setStyle(new Style({
        stroke: new Stroke({
          color: this.withOpacity(color, this.routeAppearance.trackOpacity),
          width: selected ? this.routeAppearance.selectedTrackWidth : this.routeAppearance.trackWidth,
        }),
      }));
    }
  }

  private restyleComposite(): void {
    const source = this.compositeLayer.getSource();
    if (!source) return;
    for (const feature of source.getFeatures()) {
      if (this.exportRouteStyle) {
        const route = this.exportRouteStyle;
        const styles: Style[] = [];
        if (route.halo) {
          styles.push(new Style({ stroke: new Stroke({ color: route.haloColor, width: route.haloWidth }) }));
        }
        styles.push(new Style({
          stroke: new Stroke({ color: this.withOpacity(route.color, route.opacity), width: route.width }),
        }));
        feature.setStyle(styles);
        continue;
      }
      const selected = Boolean(feature.get('selectedPiece'));
      feature.setStyle(new Style({
        stroke: new Stroke({
          color: selected ? this.routeAppearance.selectedPieceColor : this.routeAppearance.compositeColor,
          width: selected ? this.routeAppearance.selectedPieceWidth : this.routeAppearance.compositeWidth,
        }),
      }));
    }
  }

  private restyleSelection(): void {
    const source = this.selectionLayer.getSource();
    if (!source) return;
    for (const feature of source.getFeatures()) {
      const role = feature.get('selectionRole');
      if (role === 'halo') {
        feature.setStyle(new Style({ stroke: new Stroke({ color: this.routeAppearance.selectionHaloColor, width: this.routeAppearance.selectionHaloWidth }) }));
      } else if (role === 'inner') {
        feature.setStyle(new Style({ stroke: new Stroke({ color: this.routeAppearance.selectionColor, width: Math.max(3, this.routeAppearance.selectionHaloWidth - 4) }) }));
      }
    }
  }

  private makeHandle(coordinate: Coordinate, handle: SelectionHandle, color: string): Feature<Point> {
    const feature = new Feature(new Point(coordinate));
    feature.set('selectionHandle', handle);
    feature.setStyle(new Style({
      image: new CircleStyle({
        radius: 9,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#ffffff', width: 3 }),
      }),
    }));
    return feature;
  }

  private nearestSelectionIndex(coordinate: Coordinate): number {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.selectionProjected.length; index += 1) {
      const point = this.selectionProjected[index];
      const dx = point[0] - coordinate[0];
      const dy = point[1] - coordinate[1];
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  private withOpacity(hex: string, opacity: number): string {
    if (hex.startsWith('rgba(') || hex.startsWith('rgb(')) return hex;
    const value = hex.replace('#', '');
    const normalized = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }
}
