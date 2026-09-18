import { describe, expect, it } from 'vitest';
import {
  applyActiveMvpMapDetail,
  isVectorDetailProviderId,
  mvpMapDetailProfiles,
  setActiveMvpMapDetailProfile,
} from '../src/map/detail/mvp';

describe('MVP map detail profiles', () => {
  it('offers standard, hiking, road and minimal profiles', () => {
    expect(mvpMapDetailProfiles.map((profile) => profile.id)).toEqual([
      'standard',
      'hiking',
      'road',
      'minimal',
    ]);
  });

  it('identifies vector providers without changing provider selection', () => {
    expect(isVectorDetailProviderId('osm')).toBe(false);
    expect(isVectorDetailProviderId('openfreemap-positron')).toBe(true);
    expect(isVectorDetailProviderId('openfreemap-fiord')).toBe(true);
  });

  it('shifts real Positron-style path zoom expressions in hiking mode', () => {
    setActiveMvpMapDetailProfile('hiking');
    const source = {
      version: 8,
      layers: [{
        id: 'highway_path',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['get', 'class'], 'path']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#eee',
          'line-opacity': 0.9,
          'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 13, 1, 20, 10],
        },
      }],
    };

    const detailed = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(detailed.layers[0].paint['line-width']).toEqual([
      'interpolate', ['exponential', 1.2], ['zoom'], 11, 1, 18, 10,
    ]);
    expect(detailed.layers[0].filter).toEqual(source.layers[0].filter);
  });

  it('shifts explicit minzoom and zoom expressions together', () => {
    setActiveMvpMapDetailProfile('hiking');
    const source = {
      version: 8,
      layers: [{
        id: 'road_path_pedestrian',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 14,
        filter: ['match', ['get', 'class'], ['path', 'pedestrian'], true, false],
        paint: {
          'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 14, 1, 20, 10],
        },
      }],
    };

    const detailed = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(detailed.layers[0].minzoom).toBe(12);
    expect(detailed.layers[0].paint['line-width']).toEqual([
      'interpolate', ['exponential', 1.2], ['zoom'], 12, 1, 18, 10,
    ]);
  });

  it('does not mistake railway service layers for service roads', () => {
    setActiveMvpMapDetailProfile('road');
    const source = {
      version: 8,
      layers: [{
        id: 'railway_service',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 16,
        filter: ['all', ['==', ['get', 'class'], 'rail'], ['has', 'service']],
        paint: { 'line-width': 3 },
      }],
    };

    const detailed = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(detailed.layers[0].minzoom).toBe(16);
    expect(detailed.layers[0].paint).toEqual(source.layers[0].paint);
  });

  it('prioritizes roads in road mode and delays paths', () => {
    setActiveMvpMapDetailProfile('road');
    const source = {
      version: 8,
      layers: [
        {
          id: 'road_motorway',
          type: 'line',
          'source-layer': 'transportation',
          minzoom: 5,
          filter: ['==', ['get', 'class'], 'motorway'],
          paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 18, 8] },
        },
        {
          id: 'road_minor',
          type: 'line',
          'source-layer': 'transportation',
          filter: ['==', ['get', 'class'], 'minor'],
          paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14, 2.5, 20, 18] },
        },
        {
          id: 'highway_path',
          type: 'line',
          'source-layer': 'transportation',
          filter: ['==', ['get', 'class'], 'path'],
          paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 20, 10] },
        },
      ],
    };

    const detailed = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(detailed.layers[0].minzoom).toBe(3);
    expect(detailed.layers[0].paint['line-width']).toEqual(['interpolate', ['linear'], ['zoom'], 3, 1, 16, 8]);
    expect(detailed.layers[1].paint['line-width']).toEqual(['interpolate', ['linear'], ['zoom'], 12.5, 0, 13, 2.5, 19, 18]);
    expect(detailed.layers[2].paint['line-width']).toEqual(['interpolate', ['linear'], ['zoom'], 14, 1, 21, 10]);
  });

  it('delays secondary detail in minimal mode', () => {
    setActiveMvpMapDetailProfile('minimal');
    const source = {
      version: 8,
      layers: [
        {
          id: 'highway_path',
          type: 'line',
          'source-layer': 'transportation',
          filter: ['==', ['get', 'class'], 'path'],
          paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 20, 8] },
        },
        {
          id: 'waterway_other',
          type: 'line',
          'source-layer': 'waterway',
          paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 20, 6] },
        },
      ],
    };

    const detailed = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(detailed.layers[0].paint['line-width']).toEqual(['interpolate', ['linear'], ['zoom'], 15, 1, 23, 8]);
    expect(detailed.layers[1].paint['line-width']).toEqual(['interpolate', ['linear'], ['zoom'], 14, 0.5, 21, 6]);
  });

  it('leaves sources, source-layer references, filters and geometry semantics untouched', () => {
    setActiveMvpMapDetailProfile('hiking');
    const source = {
      version: 8,
      sources: { map: { type: 'vector', url: 'https://example.test/source.json' } },
      layers: [{
        id: 'trail',
        type: 'line',
        source: 'map',
        'source-layer': 'transportation',
        minzoom: 14,
        maxzoom: 18,
        filter: ['==', ['get', 'class'], 'path'],
        layout: { visibility: 'visible' },
        paint: { 'line-color': '#333', 'line-width': 2 },
      }],
    };

    const detailed = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(detailed).not.toBe(source);
    expect(detailed.sources).toEqual(source.sources);
    expect(detailed.layers[0].source).toBe(source.layers[0].source);
    expect(detailed.layers[0]['source-layer']).toBe(source.layers[0]['source-layer']);
    expect(detailed.layers[0].maxzoom).toBe(source.layers[0].maxzoom);
    expect(detailed.layers[0].filter).toEqual(source.layers[0].filter);
  });

  it('returns the provider style unchanged in standard mode', () => {
    const source = { version: 8, layers: [] } as Record<string, unknown>;
    setActiveMvpMapDetailProfile('standard');
    expect(applyActiveMvpMapDetail(source)).toBe(source);
  });
});
