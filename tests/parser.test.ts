import { describe, expect, it } from 'vitest';
import { parseGpx } from '../src/gpx/parser';
import { toCoordinateOnlyGpx } from '../src/gpx/serialize';

const sample = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>Secret</name></metadata><trk><name>Named track</name><trkseg><trkpt lat="59.1" lon="10.2"><ele>55</ele><time>2026-01-01T00:00:00Z</time><extensions><x:hr xmlns:x="urn:x">145</x:hr></extensions></trkpt><trkpt lat="59.2" lon="10.3"/></trkseg></trk></gpx>`;

describe('GPX core', () => {
  it('parses track points', () => {
    const track = parseGpx(sample, 'sample.gpx');
    expect(track.segments[0].points).toEqual([{ lat: 59.1, lon: 10.2 }, { lat: 59.2, lon: 10.3 }]);
  });

  it('exports coordinate-only GPX', () => {
    const cleaned = toCoordinateOnlyGpx(parseGpx(sample, 'sample.gpx'));
    expect(cleaned).toContain('lat="59.1" lon="10.2"');
    expect(cleaned).not.toContain('<ele>');
    expect(cleaned).not.toContain('<time>');
    expect(cleaned).not.toContain('Secret');
    expect(cleaned).not.toContain('Named track');
    expect(cleaned).not.toContain('extensions');
  });
});
