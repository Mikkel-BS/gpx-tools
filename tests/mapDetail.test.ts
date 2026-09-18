import { describe, expect, it } from 'vitest';
import {
  applyActiveMvpMapDetail,
  getActiveMvpMapDetailProfile,
  isVectorDetailProviderId,
  mvpMapDetailProfiles,
  setActiveMvpMapDetailProfile,
} from '../src/map/detail/mvp';

function visibilityOf(layer: { layout?: Record<string, unknown> }): unknown {
  return layer.layout?.visibility;
}

describe('MVP map content profiles', () => {
  it('offers standard, hiking, road and minimal profiles', () => {
    expect(mvpMapDetailProfiles.map((profile) => profile.id)).toEqual([
      'standard',
      'hiking',
      'road',
      'minimal',
    ]);
  });

  it('retains a chosen profile independently of the current provider', () => {
    expect(isVectorDetailProviderId('osm')).toBe(false);
    setActiveMvpMapDetailProfile('hiking');
    expect(getActiveMvpMapDetailProfile().id).toBe('hiking');
    setActiveMvpMapDetailProfile('minimal');
    expect(getActiveMvpMapDetailProfile().id).toBe('minimal');
  });

  it('hiking removes urban clutter while preserving paths and waterways', () => {
    setActiveMvpMapDetailProfile('hiking');
    const source = {
      version: 8,
      layers: [
        { id: 'building', type: 'fill', 'source-layer': 'building', paint: { 'fill-color': '#aaa' } },
        { id: 'poi_shop', type: 'symbol', 'source-layer': 'poi', layout: { 'text-field': '{name}' } },
        { id: 'highway-name-primary', type: 'symbol', 'source-layer': 'transportation_name', layout: { 'text-field': '{name}' } },
        { id: 'highway-name-path', type: 'symbol', 'source-layer': 'transportation_name', layout: { 'text-field': '{name}' } },
        { id: 'highway_path', type: 'line', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'path'] },
        { id: 'waterway', type: 'line', 'source-layer': 'waterway' },
      ],
    };

    const profiled = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(visibilityOf(profiled.layers[0])).toBe('none');
    expect(visibilityOf(profiled.layers[1])).toBe('none');
    expect(visibilityOf(profiled.layers[2])).toBe('none');
    expect(visibilityOf(profiled.layers[3])).not.toBe('none');
    expect(visibilityOf(profiled.layers[4])).not.toBe('none');
    expect(visibilityOf(profiled.layers[5])).not.toBe('none');
  });

  it('road removes trails, contours, natural labels and POIs while preserving roads', () => {
    setActiveMvpMapDetailProfile('road');
    const source = {
      version: 8,
      layers: [
        { id: 'highway_path', type: 'line', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'path'] },
        { id: 'contour', type: 'line', 'source-layer': 'contour' },
        { id: 'peak-label', type: 'symbol', 'source-layer': 'mountain_peak', layout: { 'text-field': '{name}' } },
        { id: 'poi', type: 'symbol', 'source-layer': 'poi', layout: { 'text-field': '{name}' } },
        { id: 'road_motorway', type: 'line', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'motorway'] },
        { id: 'road_minor', type: 'line', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'minor'] },
      ],
    };

    const profiled = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(profiled.layers.slice(0, 4).every((layer) => visibilityOf(layer) === 'none')).toBe(true);
    expect(visibilityOf(profiled.layers[4])).not.toBe('none');
    expect(visibilityOf(profiled.layers[5])).not.toBe('none');
  });

  it('minimal removes minor content but preserves major roads and place labels', () => {
    setActiveMvpMapDetailProfile('minimal');
    const source = {
      version: 8,
      layers: [
        { id: 'building', type: 'fill', 'source-layer': 'building' },
        { id: 'road_minor', type: 'line', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'minor'] },
        { id: 'highway_path', type: 'line', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'path'] },
        { id: 'poi', type: 'symbol', 'source-layer': 'poi' },
        { id: 'road_motorway', type: 'line', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'motorway'] },
        { id: 'city-label', type: 'symbol', 'source-layer': 'place', layout: { 'text-field': '{name}' } },
      ],
    };

    const profiled = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(profiled.layers.slice(0, 4).every((layer) => visibilityOf(layer) === 'none')).toBe(true);
    expect(visibilityOf(profiled.layers[4])).not.toBe('none');
    expect(visibilityOf(profiled.layers[5])).not.toBe('none');
  });

  it('does not mistake railway service layers for minor roads', () => {
    setActiveMvpMapDetailProfile('minimal');
    const source = {
      version: 8,
      layers: [{
        id: 'railway_service',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['get', 'class'], 'rail'], ['has', 'service']],
        paint: { 'line-width': 3 },
      }],
    };

    const profiled = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(visibilityOf(profiled.layers[0])).not.toBe('none');
  });

  it('changes only layout visibility and preserves structural/style fields', () => {
    setActiveMvpMapDetailProfile('road');
    const source = {
      version: 8,
      sources: { map: { type: 'vector', url: 'https://example.test/source.json' } },
      layers: [{
        id: 'highway_path',
        type: 'line',
        source: 'map',
        'source-layer': 'transportation',
        minzoom: 14,
        maxzoom: 18,
        filter: ['==', ['get', 'class'], 'path'],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#333', 'line-width': 2 },
      }],
    };

    const profiled = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(profiled).not.toBe(source);
    expect(profiled.sources).toEqual(source.sources);
    expect(profiled.layers[0].source).toBe(source.layers[0].source);
    expect(profiled.layers[0]['source-layer']).toBe(source.layers[0]['source-layer']);
    expect(profiled.layers[0].minzoom).toBe(source.layers[0].minzoom);
    expect(profiled.layers[0].maxzoom).toBe(source.layers[0].maxzoom);
    expect(profiled.layers[0].filter).toEqual(source.layers[0].filter);
    expect(profiled.layers[0].paint).toEqual(source.layers[0].paint);
    expect(profiled.layers[0].layout['line-cap']).toBe('round');
    expect(profiled.layers[0].layout.visibility).toBe('none');
  });

  it('returns the provider style unchanged in standard mode', () => {
    const source = { version: 8, layers: [] } as Record<string, unknown>;
    setActiveMvpMapDetailProfile('standard');
    expect(applyActiveMvpMapDetail(source)).toBe(source);
  });
});
