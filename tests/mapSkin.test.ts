import { describe, expect, it } from 'vitest';
import { applyActiveMvpMapSkin, setActiveMvpMapSkin } from '../src/map/skins/mvp';

describe('MVP vector map skins', () => {
  it('leaves geometry-driving style fields untouched', () => {
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
          filter: ['==', 'class', 'primary'],
          paint: { 'line-color': '#fff', 'line-width': 3 },
        },
      ],
    } as Record<string, unknown>;

    setActiveMvpMapSkin('watercolor');
    const skinned = applyActiveMvpMapSkin(sourceStyle) as typeof sourceStyle;

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
    }))).toEqual(sourceStyle.layers.map((layer) => ({
      id: layer.id,
      type: layer.type,
      source: layer.source,
      sourceLayer: layer['source-layer'],
      minzoom: layer.minzoom,
      maxzoom: layer.maxzoom,
      filter: layer.filter,
      layout: layer.layout,
    })));

    expect((skinned.layers[0].paint as Record<string, unknown>)['fill-color']).toBe('#9ebac6');
    expect((skinned.layers[1].paint as Record<string, unknown>)['line-color']).not.toBe('#fff');
  });

  it('returns provider style unchanged when the skin is disabled', () => {
    const sourceStyle = { version: 8, layers: [] } as Record<string, unknown>;
    setActiveMvpMapSkin('none');
    expect(applyActiveMvpMapSkin(sourceStyle)).toBe(sourceStyle);
  });
});
