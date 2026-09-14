import type { GpxPoint, GpxSegment, GpxTrack } from './types';

const escapeAttr = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function pointXml(point: GpxPoint, includeElevation: boolean): string {
  const attrs = `lat="${escapeAttr(String(point.lat))}" lon="${escapeAttr(String(point.lon))}"`;
  if (includeElevation && Number.isFinite(point.ele)) {
    return `      <trkpt ${attrs}><ele>${String(point.ele)}</ele></trkpt>`;
  }
  return `      <trkpt ${attrs}/>`;
}

function segmentsToGpx(segments: GpxSegment[], includeElevation: boolean): string {
  const body = segments.map((segment) => {
    const pts = segment.points.map((point) => pointXml(point, includeElevation)).join('\n');
    return `    <trkseg>\n${pts}\n    </trkseg>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="gpx-tools" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n${body}\n  </trk>\n</gpx>\n`;
}

/** Public coordinate-only export deliberately strips elevation and all other metadata. */
export function segmentsToCoordinateOnlyGpx(segments: GpxSegment[]): string {
  return segmentsToGpx(segments, false);
}

/** Internal project working geometry remains standard GPX and preserves elevation where available. */
export function segmentsToWorkingGpx(segments: GpxSegment[]): string {
  return segmentsToGpx(segments, true);
}

export function toCoordinateOnlyGpx(track: GpxTrack): string {
  return segmentsToCoordinateOnlyGpx(track.segments);
}

export function pointsToCoordinateOnlyGpx(points: GpxPoint[]): string {
  return segmentsToCoordinateOnlyGpx([{ points }]);
}
