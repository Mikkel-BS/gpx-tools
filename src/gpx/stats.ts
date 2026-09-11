import type { GpxPoint, GpxTrack, TrackStats } from './types';

const R = 6371008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceMeters(a: GpxPoint, b: GpxPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function getTrackStats(track: GpxTrack): TrackStats {
  let points = 0;
  let distanceMetersTotal = 0;
  for (const segment of track.segments) {
    points += segment.points.length;
    for (let i = 1; i < segment.points.length; i++) {
      distanceMetersTotal += distanceMeters(segment.points[i - 1], segment.points[i]);
    }
  }
  return { points, segments: track.segments.length, distanceMeters: distanceMetersTotal };
}
