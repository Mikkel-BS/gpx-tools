import { describe, expect, it } from 'vitest';
import {
  applyActiveMvpMapSkin,
  DEFAULT_MVP_SKIN_VECTOR_PROVIDER_ID,
  mvpMapSkins,
  resolveMvpSkinSelection,
  setActiveMvpMapSkin,
} from '../src/map/skins/mvp';

describe('MVP vector map skins', () => {
  it('offers a varied set of deterministic skins', () => {
    expect(mvpMapSkins.map((skin) => skin.id)).toEqual([
      'none',
      'watercolor',
      'antique-atlas',
      'alpine-topo',
      'midnight-neon',
      'blueprint',
      'autumn-field',
    ]);
  });

  it('allows every non-default skin from the default raster map by switching to a vector provider', () => {
    for (const skin of mvpMapSkins.filter((item) => item.id !== 'none')) {
      const resolved = resolveMvpSkinSelection(skin.id, 'osm');
      expect(resolved.skin.id).toBe(skin.id);
      expect(resolved.baseProviderId).toBe(DEFAULT_MVP_SKIN_VECTOR_PROVIDER_ID);
    }
  });

  it('keeps an already-selected vector provider when choosing any skin', () => {
    for (const skin of mvpMapSkins.filter((item) => item.id !== 'none')) {
      const resolved = resolveMvpSkinSelection(skin.id, 'openfreemap-fiord');
      expect(resolved.skin.id).toBe(skin.id);
      expect(resolved.baseProviderId).toBe('openfreemap-fiord');
    }
  });

  it('leaves geometry-driving style fields untouched for every skin', () => {
    const sourceStyle = {
      version: 8,
      sources: { map: { type: 'vector', url: 'https://example.test/source.json' } },
      layers: [
        {
          id: 'water-fill',
          type: 'fill',
          source: 'map',
          'source-layer': 'water',
          minzoom: 2,
          maxzoom: 18,
          filter: ['==', '$type', 'Polygon'],
          layout: { visibility: 'visible' },
          paint: { 'fill-color': '#00f' },
        },
        {
          id: 'primary-road',
          type: 'line',
          source: 'map',
          'source-layer': 'transportation',
          minzoom: undefined,
          maxzoom: undefined,
          filter: ['==', 'class', 'primary'],
          layout: undefined,
          paint: { 'line-color': '#fff', 'line-width': 3 },
        },
      ],
    };

    const geometrySnapshot = sourceStyle.layers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      source: layer.source,
      sourceLayer: layer['source-layer'],
      minzoom: layer.minzoom,
      maxzoom: layer.maxzoom,
      filter: layer.filter,
      layout: layer.layout,
    }));

    for (const skin of mvpMapSkins.filter((item) => item.id !== 'none')) {
      setActiveMvpMapSkin(skin.id);
      const skinned = applyActiveMvpMapSkin(sourceStyle as unknown as Record<string, unknown>) as unknown as typeof sourceStyle;

      expect(skinned).not.toBe(sourceStyle);
      expect(skinned.sources).toEqual(sourceStyle.sources);
      expect(skinned.layers.map((layer) => ({
        id: layer.id,
        type: layer.type,
        source: layer.source,
        sourceLayer: layer['source-layer'],
        minzoom: layer.minzoom,
        maxzoom: layer.maxzoom,
        filter: layer.filter,
        layout: layer.layout,
      }))).toEqual(geometrySnapshot);
      expect(skinned.layers[0].paint['fill-color']).not.toBe('#00f');
      expect(skinned.layers[1].paint['line-color']).not.toBe('#fff');
    }
  });

  it('makes the skins visually distinct at the palette level', () => {
    const signatures = mvpMapSkins
      .filter((skin) => skin.palette)
      .map((skin) => `${skin.palette!.background}|${skin.palette!.water}|${skin.palette!.forest}|${skin.palette!.roadMajor}|${skin.palette!.label}`);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('returns provider style unchanged when the skin is disabled', () => {
    const sourceStyle = { version: 8, layers: [] } as Record<string, unknown>;
    setActiveMvpMapSkin('none');
    expect(applyActiveMvpMapSkin(sourceStyle)).toBe(sourceStyle);
  });
});
