import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import { fromLonLat } from 'ol/proj.js';
import { Stroke, Style } from 'ol/style.js';
import type { GpxTrack } from '../gpx/types';
import { rasterProviders } from './sources/providers';

const palette = ['#d33f49', '#3568d4', '#31855b', '#8b4fb3'];

export class MapController {
  private map: Map;
  private trackLayer: VectorLayer<VectorSource>;
  private baseLayer: TileLayer<XYZ>;

  constructor(target: HTMLElement) {
    const provider = rasterProviders[0];
    this.baseLayer = new TileLayer({
      source: new XYZ({ url: provider.url, attributions: provider.attribution, maxZoom: provider.maxZoom }),
    });
    this.trackLayer = new VectorLayer({ source: new VectorSource() });
    this.map = new Map({
      target,
      layers: [this.baseLayer, this.trackLayer],
      view: new View({ center: fromLonLat([10.75, 59.91]), zoom: 8 }),
    });
  }

  setTracks(tracks: GpxTrack[], selectedTrackId?: string): void {
    const source = this.trackLayer.getSource();
    if (!source) return;
    source.clear();
    tracks.forEach((track, index) => {
      const lines = track.segments.map((segment) => segment.points.map((p) => fromLonLat([p.lon, p.lat])));
      const feature = new Feature(new MultiLineString(lines));
      feature.setStyle(new Style({
        stroke: new Stroke({ color: palette[index % palette.length], width: track.id === selectedTrackId ? 5 : 3 }),
      }));
      feature.setId(track.id);
      source.addFeature(feature);
    });
    if (tracks.length) {
      const extent = source.getExtent();
      if (extent.every(Number.isFinite)) this.map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 15, duration: 250 });
    }
  }
}
