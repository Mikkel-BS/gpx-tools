import type { GpxPoint, GpxSegment, GpxTrack } from '../gpx/types';

export interface RoutePiece {
  id: string;
  trackId: string;
  segmentIndex: number;
  startPointIndex: number;
  endPointIndex: number;
  /** Flat indexes are retained only for UI display/backward compatibility. Geometry must use segment-local indexes. */
  startIndex: number;
  endIndex: number;
  reversed: boolean;
}

export interface Discontinuity {
  afterPieceId: string;
  beforePieceId: string;
  distanceMeters: number;
}

export interface FlatIndexLocation {
  segmentIndex: number;
  pointIndex: number;
}

export interface DerivedRoute {
  segments: GpxSegment[];
}

export function cloneSegments(segments: GpxSegment[]): GpxSegment[] {
  return segments.map((segment) => ({ points: segment.points.map((point) => ({ ...point })) }));
}

export function flattenTrack(track: GpxTrack): GpxPoint[] {
  return track.segments.flatMap((segment) => segment.points);
}

export function locateFlatIndex(track: GpxTrack, flatIndex: number): FlatIndexLocation | undefined {
  let offset = 0;
  for (let segmentIndex = 0; segmentIndex < track.segments.length; segmentIndex += 1) {
    const count = track.segments[segmentIndex].points.length;
    if (flatIndex >= offset && flatIndex < offset + count) {
      return { segmentIndex, pointIndex: flatIndex - offset };
    }
    offset += count;
  }
  return undefined;
}

export function flatIndexForLocation(track: GpxTrack, location: FlatIndexLocation): number | undefined {
  if (location.segmentIndex < 0 || location.segmentIndex >= track.segments.length) return undefined;
  const segment = track.segments[location.segmentIndex];
  if (location.pointIndex < 0 || location.pointIndex >= segment.points.length) return undefined;
  let offset = 0;
  for (let index = 0; index < location.segmentIndex; index += 1) offset += track.segments[index].points.length;
  return offset + location.pointIndex;
}

export function indicesShareSegment(track: GpxTrack, a: number, b: number): boolean {
  const locationA = locateFlatIndex(track, a);
  const locationB = locateFlatIndex(track, b);
  return Boolean(locationA && locationB && locationA.segmentIndex === locationB.segmentIndex);
}

export function flatIndicesAreAdjacentInSegment(track: GpxTrack, a: number, b: number): boolean {
  const locationA = locateFlatIndex(track, a);
  const locationB = locateFlatIndex(track, b);
  return Boolean(
    locationA && locationB
    && locationA.segmentIndex === locationB.segmentIndex
    && Math.abs(locationA.pointIndex - locationB.pointIndex) === 1
  );
}

function clampFlatIndex(track: GpxTrack, value: number): number {
  const pointCount = flattenTrack(track).length;
  return Math.max(0, Math.min(pointCount - 1, Math.round(value)));
}

function requireSingleSegmentRange(track: GpxTrack, start: number, end: number, operation: string): void {
  if (!indicesShareSegment(track, start, end)) {
    throw new Error(`${operation} cannot cross a GPX track-segment boundary. Select points within one segment.`);
  }
}

function sameCoordinate(a: GpxPoint, b: GpxPoint): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}

export function trimTrack(track: GpxTrack, startIndex: number, endIndex: number): GpxTrack {
  const points = flattenTrack(track);
  if (points.length < 2) throw new Error('Track must contain at least two points.');
  const start = clampFlatIndex(track, startIndex);
  const end = clampFlatIndex(track, endIndex);
  if (start === end) throw new Error('Trim selection must contain at least two points.');
  requireSingleSegmentRange(track, start, end, 'Trim');
  const startLocation = locateFlatIndex(track, start)!;
  const endLocation = locateFlatIndex(track, end)!;
  const lo = Math.min(startLocation.pointIndex, endLocation.pointIndex);
  const hi = Math.max(startLocation.pointIndex, endLocation.pointIndex);
  const sourceSegment = track.segments[startLocation.segmentIndex];
  return { ...track, segments: [{ points: sourceSegment.points.slice(lo, hi + 1).map((point) => ({ ...point })) }] };
}

export function resetTrack(track: GpxTrack): GpxTrack {
  return { ...track, segments: cloneSegments(track.originalSegments) };
}

export function canSplitTrackAtFlatIndex(track: GpxTrack, flatIndex: number): boolean {
  const location = locateFlatIndex(track, Math.round(flatIndex));
  if (!location) return false;
  const segment = track.segments[location.segmentIndex];
  return location.pointIndex > 0 && location.pointIndex < segment.points.length - 1;
}

/** Split one working segment at an existing point. The split point is retained as the end/start of both new segments. */
export function splitTrackAtFlatIndex(track: GpxTrack, flatIndex: number): GpxTrack {
  const index = clampFlatIndex(track, flatIndex);
  const location = locateFlatIndex(track, index);
  if (!location || !canSplitTrackAtFlatIndex(track, index)) {
    throw new Error('Split point must be inside a track segment, not at one of its endpoints.');
  }
  const source = track.segments[location.segmentIndex];
  const left: GpxSegment = { points: source.points.slice(0, location.pointIndex + 1).map((point) => ({ ...point })) };
  const right: GpxSegment = { points: source.points.slice(location.pointIndex).map((point) => ({ ...point })) };
  const segments = cloneSegments(track.segments);
  segments.splice(location.segmentIndex, 1, left, right);
  return { ...track, segments };
}

export function countJoinableSegmentBoundaries(track: GpxTrack): number {
  let count = 0;
  for (let index = 0; index < track.segments.length - 1; index += 1) {
    const left = track.segments[index].points.at(-1);
    const right = track.segments[index + 1].points[0];
    if (left && right && sameCoordinate(left, right)) count += 1;
  }
  return count;
}

/** Join only adjacent working segments whose boundary coordinates are exactly identical. No gap threshold is used. */
export function joinTouchingSegments(track: GpxTrack): GpxTrack {
  if (!countJoinableSegmentBoundaries(track)) {
    throw new Error('No adjacent track segments share an exact endpoint, so there is nothing safe to join.');
  }
  const joined: GpxSegment[] = [];
  for (const segment of track.segments) {
    if (!segment.points.length) continue;
    const previous = joined.at(-1);
    const previousEnd = previous?.points.at(-1);
    const nextStart = segment.points[0];
    if (previous && previousEnd && sameCoordinate(previousEnd, nextStart)) {
      previous.points.push(...segment.points.slice(1).map((point) => ({ ...point })));
    } else {
      joined.push({ points: segment.points.map((point) => ({ ...point })) });
    }
  }
  return { ...track, segments: joined };
}

export function createPiece(track: GpxTrack, startIndex: number, endIndex: number): RoutePiece {
  const points = flattenTrack(track);
  if (points.length < 2) throw new Error('Track must contain at least two points.');
  const start = clampFlatIndex(track, startIndex);
  const end = clampFlatIndex(track, endIndex);
  if (start === end) throw new Error('A route piece must contain at least two points.');
  requireSingleSegmentRange(track, start, end, 'Route piece');
  const startLocation = locateFlatIndex(track, start)!;
  const endLocation = locateFlatIndex(track, end)!;
  return {
    id: crypto.randomUUID(),
    trackId: track.id,
    segmentIndex: startLocation.segmentIndex,
    startPointIndex: Math.min(startLocation.pointIndex, endLocation.pointIndex),
    endPointIndex: Math.max(startLocation.pointIndex, endLocation.pointIndex),
    startIndex: Math.min(start, end),
    endIndex: Math.max(start, end),
    reversed: start > end,
  };
}

export function getPiecePoints(piece: RoutePiece, tracks: GpxTrack[]): GpxPoint[] {
  const track = tracks.find((item) => item.id === piece.trackId);
  const segment = track?.segments[piece.segmentIndex];
  if (!segment) return [];
  const start = Math.max(0, Math.min(segment.points.length - 1, piece.startPointIndex));
  const end = Math.max(0, Math.min(segment.points.length - 1, piece.endPointIndex));
  if (start > end) return [];
  const points = segment.points.slice(start, end + 1);
  return piece.reversed ? [...points].reverse() : points;
}

export function buildCompositeSegments(pieces: RoutePiece[], tracks: GpxTrack[]): GpxSegment[] {
  return pieces
    .map((piece) => ({ points: getPiecePoints(piece, tracks).map((point) => ({ ...point })) }))
    .filter((segment) => segment.points.length >= 2);
}

/** @deprecated Prefer buildCompositeSegments so discontinuities remain explicit. */
export function buildComposite(pieces: RoutePiece[], tracks: GpxTrack[]): GpxPoint[] {
  return buildCompositeSegments(pieces, tracks).flatMap((segment) => segment.points);
}

export function routePiecesAreAdjacent(a: RoutePiece, b: RoutePiece): boolean {
  if (a.trackId !== b.trackId || a.segmentIndex !== b.segmentIndex) return false;
  const orientedEnd = a.reversed ? a.startPointIndex : a.endPointIndex;
  const orientedStart = b.reversed ? b.endPointIndex : b.startPointIndex;
  return Math.abs(orientedEnd - orientedStart) === 1;
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
