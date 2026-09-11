import { flatIndicesAreAdjacentInSegment, getPiecePoints, type RoutePiece } from '../editor/model';
import type { GpxPoint, GpxTrack } from '../gpx/types';
import { routeLengthMeters } from './simplify';
import type { Ntr1Source } from './types';

export const NTR1_CONTINUITY_MESSAGE = 'NTR1 v1 stores one continuous route. This route contains separate segments or gaps. Join/edit the route first, or create separate QR codes for the segments.';

function sameCoordinate(a: GpxPoint, b: GpxPoint): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}

function orientedStartIndex(piece: RoutePiece): number {
  return piece.reversed ? piece.endIndex : piece.startIndex;
}

function orientedEndIndex(piece: RoutePiece): number {
  return piece.reversed ? piece.startIndex : piece.endIndex;
}

export function sourceFromWorkingTrack(track: GpxTrack): Ntr1Source {
  const nonEmpty = track.segments.filter((segment) => segment.points.length > 0);
  if (nonEmpty.length !== 1) throw new Error(NTR1_CONTINUITY_MESSAGE);
  const points = nonEmpty[0].points.map((point) => ({ ...point }));
  if (points.length < 2) throw new Error('The selected working track does not contain enough points for NTR1.');
  return {
    id: 'working-track',
    label: 'Selected working track',
    points,
    segments: 1,
    distanceMeters: routeLengthMeters(points),
    fileStem: track.fileName.replace(/\.gpx$/i, '') || 'route',
  };
}

export function sourceFromCombinedRoute(pieces: RoutePiece[], tracks: GpxTrack[]): Ntr1Source {
  if (!pieces.length) throw new Error('The combined route is empty.');
  const route: GpxPoint[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const points = getPiecePoints(piece, tracks);
    if (points.length < 2) throw new Error(NTR1_CONTINUITY_MESSAGE);
    if (index === 0) {
      route.push(...points.map((point) => ({ ...point })));
      continue;
    }
    const previousPiece = pieces[index - 1];
    const previousEnd = route.at(-1)!;
    const nextStart = points[0];
    if (sameCoordinate(previousEnd, nextStart)) {
      route.push(...points.slice(1).map((point) => ({ ...point })));
      continue;
    }
    const previousTrack = tracks.find((track) => track.id === previousPiece.trackId);
    const adjacentSameSource = Boolean(
      previousTrack
      && previousPiece.trackId === piece.trackId
      && flatIndicesAreAdjacentInSegment(previousTrack, orientedEndIndex(previousPiece), orientedStartIndex(piece))
    );
    if (!adjacentSameSource) throw new Error(NTR1_CONTINUITY_MESSAGE);
    route.push(...points.map((point) => ({ ...point })));
  }
  if (route.length < 2) throw new Error('The combined route does not contain enough points for NTR1.');
  return {
    id: 'combined-route',
    label: 'Combined route',
    points: route,
    segments: 1,
    distanceMeters: routeLengthMeters(route),
    fileStem: 'combined-route',
  };
}
