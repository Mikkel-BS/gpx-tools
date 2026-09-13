import { describe, expect, it } from 'vitest';
import { chooseNiceScaleDistance } from '../src/export/decorations';
import { makeImageDimensions, mmToPixels } from '../src/export/layout';
import { applyImageStylePreset, defaultImageExportSettings, imageStylePresets } from '../src/export/settings';
import { getBaseMapDefinition } from '../src/map/sources/baseMaps';
import { getRasterProvider } from '../src/map/sources/providers';
import { vectorStyleProviders } from '../src/map/sources/vectorStyles';

describe('publication image export', () => {
  it('converts physical dimensions to pixels deterministically', () => {
    expect(mmToPixels(25.4, 300)).toBe(300);
    const dimensions = makeImageDimensions(160, 100, 300);
    expect(dimensions.widthPx).toBe(1890);
    expect(dimensions.heightPx).toBe(1181);
    expect(dimensions.aspect).toBeCloseTo(1890 / 1181);
  });

  it('caps impractically large browser renders', () => {
    expect(() => makeImageDimensions(1000, 1000, 600)).toThrow(/25 megapixels/i);
  });

  it('chooses conventional scale-bar distances', () => {
    expect(chooseNiceScaleDistance(78)).toBe(50);
    expect(chooseNiceScaleDistance(240)).toBe(200);
    expect(chooseNiceScaleDistance(720)).toBe(500);
  });

  it('provides a small reusable publication style library without overwriting project content', () => {
    expect(imageStylePresets.map((preset) => preset.id)).toEqual([
      'book-light',
      'minimal-editorial',
      'monochrome-print',
      'high-contrast-trail',
    ]);
    const project = { ...defaultImageExportSettings(), title: 'My route', widthMm: 177 };
    const styled = applyImageStylePreset(project, 'monochrome-print');
    expect(styled.title).toBe('My route');
    expect(styled.widthMm).toBe(177);
    expect(styled.routeColor).toBe('#000000');
    expect(styled.presetId).toBe('monochrome-print');
  });

  it('allows OSM publication export only with attribution', () => {
    const osm = getRasterProvider('osm');
    expect(osm.publicationExportPolicy).toBe('allowed-with-attribution');
    expect(osm.publicationAttribution).toContain('OpenStreetMap contributors');
    expect(osm.publicationAttribution).toContain('openstreetmap.org/copyright');
  });

  it('conservatively blocks Kartverket cache tiles pending rights review', () => {
    expect(getRasterProvider('kartverket-topo').publicationExportPolicy).toBe('blocked-review');
    expect(getRasterProvider('kartverket-gray').publicationExportPolicy).toBe('blocked-review');
  });

  it('keeps the curated vector library deliberately small and API-key free', () => {
    expect(vectorStyleProviders.map((provider) => provider.id)).toEqual([
      'openfreemap-positron',
      'openfreemap-liberty',
      'openfreemap-fiord',
      'openfreemap-dark',
    ]);
    for (const provider of vectorStyleProviders) {
      expect(provider.styleUrl).toMatch(/^https:\/\/tiles\.openfreemap\.org\/styles\//);
      expect(provider.styleUrl).not.toMatch(/key=|token=/i);
    }
  });

  it('requires OpenFreeMap/OpenMapTiles/OpenStreetMap attribution for vector publication export', () => {
    const positron = getBaseMapDefinition('openfreemap-positron');
    expect(positron.kind).toBe('vector-style');
    expect(positron.publicationExportPolicy).toBe('allowed-with-attribution');
    expect(positron.publicationAttribution).toContain('OpenFreeMap');
    expect(positron.publicationAttribution).toContain('OpenMapTiles');
    expect(positron.publicationAttribution).toContain('OpenStreetMap');
  });
});
