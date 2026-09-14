import { describe, expect, it } from 'vitest';
import { chooseNiceScaleDistance } from '../src/export/decorations';
import { buildElevationProfile, profileHorizontalCoverageMeters, profileVerticalCoverageMeters } from '../src/export/elevationProfile';
import { makeImageDimensions, mmToPixels } from '../src/export/layout';
import {
  applyImageStylePreset,
  defaultImageExportSettings,
  groundCoverageMeters,
  imageStylePresets,
  mapScalePresets,
} from '../src/export/settings';
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

  it('offers practical Norwegian print-map scales and calculates physical ground coverage', () => {
    expect(mapScalePresets.map((preset) => preset.denominator)).toEqual([10_000, 25_000, 50_000, 100_000, 250_000]);
    expect(groundCoverageMeters(160, 100, 50_000)).toEqual({ width: 8_000, height: 5_000 });
  });

  it('builds elevation profiles without adding distance across segment gaps', () => {
    const profile = buildElevationProfile([
      { points: [{ lat: 60, lon: 10, ele: 100 }, { lat: 60.001, lon: 10, ele: 150 }] },
      { points: [{ lat: 61, lon: 11, ele: 400 }, { lat: 61.001, lon: 11, ele: 450 }] },
    ])!;
    expect(profile.sourceSegmentCount).toBe(2);
    expect(profile.breakDistancesMeters).toHaveLength(1);
    expect(profile.totalDistanceMeters).toBeGreaterThan(200);
    expect(profile.totalDistanceMeters).toBeLessThan(230);
    expect(profile.minElevationMeters).toBe(100);
    expect(profile.maxElevationMeters).toBe(450);
    expect(profile.paths).toHaveLength(2);
  });

  it('expresses locked profile axes as real physical comparison scales', () => {
    expect(profileHorizontalCoverageMeters(160, 1000)).toBe(16_000);
    expect(profileVerticalCoverageMeters(40, 100)).toBe(400);
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
