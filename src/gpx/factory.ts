import { pointsToCoordinateOnlyGpx } from './serialize';
import type { GpxPoint, GpxTrack } from './types';

export function createCoordinateOnlyTrack(points: GpxPoint[], fileName = 'ntr1-route.gpx'): GpxTrack {
  if (points.length < 2) throw new Error('A track requires at least two points.');
  const copied = points.map((point) => ({ lat: point.lat, lon: point.lon }));
  const originalXml = pointsToCoordinateOnlyGpx(copied);
  return {
    id: crypto.randomUUID(),
    fileName,
    originalXml,
    originalSegments: [{ points: copied.map((point) => ({ ...point })) }],
    segments: [{ points: copied.map((point) => ({ ...point })) }],
    importedAt: Date.now(),
  };
}
