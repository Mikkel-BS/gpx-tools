import type { GpxTrack } from './types';

const escapeAttr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

export function toCoordinateOnlyGpx(track: GpxTrack): string {
  const segments = track.segments.map((segment) => {
    const pts = segment.points.map((p) => `      <trkpt lat="${escapeAttr(String(p.lat))}" lon="${escapeAttr(String(p.lon))}"/>`).join('\n');
    return `    <trkseg>\n${pts}\n    </trkseg>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="gpx-tools" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n${segments}\n  </trk>\n</gpx>\n`;
}
