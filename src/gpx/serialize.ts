import type { GpxPoint, GpxTrack } from './types';

const escapeAttr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function pointXml(point: GpxPoint): string {
  return `      <trkpt lat="${escapeAttr(String(point.lat))}" lon="${escapeAttr(String(point.lon))}"/>`;
}

export function toCoordinateOnlyGpx(track: GpxTrack): string {
  const segments = track.segments.map((segment) => {
    const pts = segment.points.map(pointXml).join('\n');
    return `    <trkseg>\n${pts}\n    </trkseg>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="gpx-tools" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n${segments}\n  </trk>\n</gpx>\n`;
}

export function pointsToCoordinateOnlyGpx(points: GpxPoint[]): string {
  const pts = points.map(pointXml).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="gpx-tools" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`;
}
