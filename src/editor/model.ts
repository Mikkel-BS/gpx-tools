import type { GpxPoint, GpxSegment, GpxTrack } from '../gpx/types';

export interface RoutePiece {
  id: string;
  trackId: string;
  startIndex: number;
  endIndex: number;
  reversed: boolean;
}

export interface Discontinuity {
  afterPieceId: string;
  beforePieceId: string;
  distanceMeters: number;
}

export function cloneSegments(segments: GpxSegment[]): GpxSegment[] {
  return segments.map((segment) => ({ points: segment.points.map((point) => ({ ...point })) }));
}

export function flattenTrack(track: GpxTrack): GpxPoint[] {
  return track.segments.flatMap((segment) => segment.points);
}

export function trimTrack(track: GpxTrack, startIndex: number, endIndex: number): GpxTrack {
  const points = flattenTrack(track);
  if (points.length < 2) throw new Error('Track must contain at least two points.');
  const start = Math.max(0, Math.min(points.length - 1, Math.round(startIndex)));
  const end = Math.max(0, Math.min(points.length - 1, Math.round(endIndex)));
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (lo === hi) throw new Error('Trim selection must contain at least two points.');
  return { ...track, segments: [{ points: points.slice(lo, hi + 1).map((point) => ({ ...point })) }] };
}

export function resetTrack(track: GpxTrack): GpxTrack {
  return { ...track, segments: cloneSegments(track.originalSegments) };
}

export function createPiece(track: GpxTrack, startIndex: number, endIndex: number): RoutePiece {
  const points = flattenTrack(track);
  if (points.length < 2) throw new Error('Track must contain at least two points.');
  const start = Math.max(0, Math.min(points.length - 1, Math.round(startIndex)));
  const end = Math.max(0, Math.min(points.length - 1, Math.round(endIndex)));
  if (start === end) throw new Error('A route piece must contain at least two points.');
  return {
    id: crypto.randomUUID(),
    trackId: track.id,
    startIndex: Math.min(start, end),
    endIndex: Math.max(start, end),
    reversed: start > end,
  };
}

export function getPiecePoints(piece: RoutePiece, tracks: GpxTrack[]): GpxPoint[] {
  const track = tracks.find((item) => item.id === piece.trackId);
  if (!track) return [];
  const points = flattenTrack(track).slice(piece.startIndex, piece.endIndex + 1);
  return piece.reversed ? [...points].reverse() : points;
}

export function buildComposite(pieces: RoutePiece[], tracks: GpxTrack[]): GpxPoint[] {
  return pieces.flatMap((piece) => getPiecePoints(piece, tracks));
}

export function haversineMeters(a: GpxPoint, b: GpxPoint): number {
  const radius = 6_371_000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function detectDiscontinuities(
  pieces: RoutePiece[],
  tracks: GpxTrack[],
  thresholdMeters = 50,
): Discontinuity[] {
  const result: Discontinuity[] = [];
  for (let index = 0; index < pieces.length - 1; index += 1) {
    const current = pieces[index];
    const next = pieces[index + 1];
    const currentPoints = getPiecePoints(current, tracks);
    const nextPoints = getPiecePoints(next, tracks);
    const a = currentPoints.at(-1);
    const b = nextPoints[0];
    if (!a || !b) continue;
    const distanceMeters = haversineMeters(a, b);
    if (distanceMeters > thresholdMeters) {
      result.push({ afterPieceId: current.id, beforePieceId: next.id, distanceMeters });
    }
  }
  return result;
}
