import { describe, expect, it } from 'vitest';
import {
  applyActiveMvpMapDetail,
  DEFAULT_MVP_DETAIL_VECTOR_PROVIDER_ID,
  mvpMapDetailProfiles,
  resolveMvpDetailSelection,
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

  it('switches from a raster map to the default vector provider for non-standard detail', () => {
    for (const profile of mvpMapDetailProfiles.filter((item) => item.id !== 'standard')) {
      const resolved = resolveMvpDetailSelection(profile.id, 'osm');
      expect(resolved.profile.id).toBe(profile.id);
      expect(resolved.baseProviderId).toBe(DEFAULT_MVP_DETAIL_VECTOR_PROVIDER_ID);
    }
  });

  it('keeps an existing vector provider', () => {
    const resolved = resolveMvpDetailSelection('hiking', 'openfreemap-fiord');
    expect(resolved.baseProviderId).toBe('openfreemap-fiord');
  });

  it('reveals hiking-relevant details earlier', () => {
    setActiveMvpMapDetailProfile('hiking');
    const source = {
      version: 8,
      layers: [
        { id: 'trail', type: 'line', 'source-layer': 'path', minzoom: 14, paint: { 'line-color': '#111' } },
        { id: 'stream', type: 'line', 'source-layer': 'waterway', minzoom: 12, paint: { 'line-color': '#00f' } },
        { id: 'contour', type: 'line', 'source-layer': 'contour', minzoom: 13, paint: { 'line-color': '#777' } },
        { id: 'peak-label', type: 'symbol', 'source-layer': 'mountain_peak', minzoom: 12, layout: { 'text-field': '{name}' }, paint: { 'text-color': '#222' } },
      ],
    } as unknown as Record<string, unknown>;

    const detailed = applyActiveMvpMapDetail(source) as unknown as {
      layers: Array<{ minzoom: number }>;
    };
    expect(detailed.layers.map((layer) => layer.minzoom)).toEqual([12, 11, 12, 11]);
  });

  it('prioritizes roads in road mode', () => {
    setActiveMvpMapDetailProfile('road');
    const source = {
      version: 8,
      layers: [
        { id: 'primary-road', type: 'line', 'source-layer': 'transportation', minzoom: 8 },
        { id: 'service-road', type: 'line', 'source-layer': 'road service', minzoom: 13 },
        { id: 'trail', type: 'line', 'source-layer': 'path', minzoom: 14 },
        { id: 'contour', type: 'line', 'source-layer': 'contour', minzoom: 13 },
      ],
    } as unknown as Record<string, unknown>;

    const detailed = applyActiveMvpMapDetail(source) as unknown as {
      layers: Array<{ minzoom: number }>;
    };
    expect(detailed.layers.map((layer) => layer.minzoom)).toEqual([6, 12, 15, 14]);
  });

  it('delays secondary detail in minimal mode', () => {
    setActiveMvpMapDetailProfile('minimal');
    const source = {
      version: 8,
      layers: [
        { id: 'trail', type: 'line', 'source-layer': 'path', minzoom: 12 },
        { id: 'contour', type: 'line', 'source-layer': 'contour', minzoom: 11 },
        { id: 'stream', type: 'line', 'source-layer': 'waterway', minzoom: 10 },
        { id: 'service-road', type: 'line', 'source-layer': 'road service', minzoom: 11 },
        { id: 'poi', type: 'symbol', 'source-layer': 'poi', minzoom: 12 },
      ],
    } as unknown as Record<string, unknown>;

    const detailed = applyActiveMvpMapDetail(source) as unknown as {
      layers: Array<{ minzoom: number }>;
    };
    expect(detailed.layers.map((layer) => layer.minzoom)).toEqual([15, 13, 11, 13, 14]);
  });

  it('changes only minzoom and leaves paint, filters, layout, maxzoom and sources untouched', () => {
    setActiveMvpMapDetailProfile('hiking');
    const source = {
      version: 8,
      sources: { map: { type: 'vector', url: 'https://example.test/source.json' } },
      layers: [{
        id: 'trail',
        type: 'line',
        source: 'map',
        'source-layer': 'path',
        minzoom: 14,
        maxzoom: 18,
        filter: ['==', 'class', 'path'],
        layout: { visibility: 'visible' },
        paint: { 'line-color': '#333', 'line-width': 2 },
      }],
    };

    const detailed = applyActiveMvpMapDetail(source as unknown as Record<string, unknown>) as unknown as typeof source;
    expect(detailed).not.toBe(source);
    expect(detailed.sources).toEqual(source.sources);
    expect(detailed.layers[0].minzoom).toBe(12);
    expect(detailed.layers[0].maxzoom).toBe(source.layers[0].maxzoom);
    expect(detailed.layers[0].filter).toEqual(source.layers[0].filter);
    expect(detailed.layers[0].layout).toEqual(source.layers[0].layout);
    expect(detailed.layers[0].paint).toEqual(source.layers[0].paint);
  });

  it('returns the provider style unchanged in standard mode', () => {
    const source = { version: 8, layers: [] } as Record<string, unknown>;
    setActiveMvpMapDetailProfile('standard');
    expect(applyActiveMvpMapDetail(source)).toBe(source);
  });
});
