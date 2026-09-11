import { describe, expect, it } from 'vitest';
import { chooseNiceScaleDistance } from '../src/export/decorations';
import { makeImageDimensions, mmToPixels } from '../src/export/layout';
import { getRasterProvider } from '../src/map/sources/providers';

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
});
