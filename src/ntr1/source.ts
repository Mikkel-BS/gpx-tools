import type { RoutePiece } from '../editor/model';
import type { GpxTrack } from '../gpx/types';
import { getContinuousCombinedRoute } from '../project/geometry';
import { routeLengthMeters } from './simplify';
import type { Ntr1Source } from './types';

export const NTR1_CONTINUITY_MESSAGE = 'NTR1 v1 stores one continuous route. This route contains separate segments or gaps. Join/edit the route first, or create separate QR codes for the segments.';

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
  const route = getContinuousCombinedRoute(pieces, tracks);
  if (!route) throw new Error(NTR1_CONTINUITY_MESSAGE);
  return {
    id: 'combined-route',
    label: 'Combined route',
    points: route,
    segments: 1,
    distanceMeters: routeLengthMeters(route),
    fileStem: 'combined-route',
  };
}
