import Map from 'ol/Map.js';
import View from 'ol/View.js';
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
import { flattenTrack, getPiecePoints, type RoutePiece } from '../editor/model';
import type { GpxTrack } from '../gpx/types';
import { getRasterProvider, rasterProviders } from './sources/providers';
import { getCartographicPreset, type CartographicStylePreset } from './styles/presets';

const palette = ['#d33f49', '#3568d4', '#31855b', '#8b4fb3'];
type SelectionHandle = 'start' | 'end';
export type MapLayerId = 'base' | 'tracks' | 'combined' | 'selection';

export class MapController {
  private map: Map;
  private trackLayer: VectorLayer<VectorSource>;
  private selectionLayer: VectorLayer<VectorSource>;
  private compositeLayer: VectorLayer<VectorSource>;
  private baseLayer: TileLayer<XYZ>;
  private selectionTrack?: GpxTrack;
  private selectionProjected: Coordinate[] = [];
  private selectionChangeHandler?: (handle: SelectionHandle, index: number) => void;
  private trackSignature = '';
  private preset: CartographicStylePreset = getCartographicPreset('book-light');

  constructor(target: HTMLElement) {
    const provider = rasterProviders[0];
    this.baseLayer = new TileLayer({
      source: this.makeRasterSource(provider.id),
      zIndex: 0,
    });
    this.trackLayer = new VectorLayer({ source: new VectorSource(), zIndex: 10 });
    this.compositeLayer = new VectorLayer({ source: new VectorSource(), zIndex: 20 });
    this.selectionLayer = new VectorLayer({ source: new VectorSource(), zIndex: 30 });
    this.map = new Map({
      target,
      layers: [this.baseLayer, this.trackLayer, this.compositeLayer, this.selectionLayer],
      view: new View({ center: fromLonLat([10.75, 59.91]), zoom: 8 }),
    });

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

  setBaseProvider(providerId: string): void {
    this.baseLayer.setSource(this.makeRasterSource(providerId));
  }

  setLayerVisibility(layerId: MapLayerId, visible: boolean): void {
    this.getLayer(layerId).setVisible(visible);
  }

  setLayerOpacity(layerId: MapLayerId, opacity: number): void {
    this.getLayer(layerId).setOpacity(Math.max(0, Math.min(1, opacity)));
  }

  setStylePreset(presetId: string): void {
    this.preset = getCartographicPreset(presetId);
    this.restyleTracks();
    this.restyleComposite();
    this.restyleSelection();
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

    if (hi > lo) {
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

  private makeRasterSource(providerId: string): XYZ {
    const provider = getRasterProvider(providerId);
    return new XYZ({
      url: provider.url,
      attributions: provider.attribution,
      maxZoom: provider.maxZoom,
      crossOrigin: 'anonymous',
    });
  }

  private getLayer(layerId: MapLayerId): TileLayer<XYZ> | VectorLayer<VectorSource> {
    if (layerId === 'base') return this.baseLayer;
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
      const color = palette[index % palette.length];
      feature.setStyle(new Style({
        stroke: new Stroke({
          color: this.withOpacity(color, this.preset.trackOpacity),
          width: selected ? this.preset.selectedTrackWidth : this.preset.trackWidth,
        }),
      }));
    }
  }

  private restyleComposite(): void {
    const source = this.compositeLayer.getSource();
    if (!source) return;
    for (const feature of source.getFeatures()) {
      const selected = Boolean(feature.get('selectedPiece'));
      feature.setStyle(new Style({
        stroke: new Stroke({
          color: selected ? this.preset.selectedPieceColor : this.preset.compositeColor,
          width: selected ? this.preset.selectedPieceWidth : this.preset.compositeWidth,
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
        feature.setStyle(new Style({ stroke: new Stroke({ color: this.preset.selectionHaloColor, width: this.preset.selectionHaloWidth }) }));
      } else if (role === 'inner') {
        feature.setStyle(new Style({ stroke: new Stroke({ color: this.preset.selectionColor, width: Math.max(3, this.preset.selectionHaloWidth - 4) }) }));
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
    const value = hex.replace('#', '');
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }
}
