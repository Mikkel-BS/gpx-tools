import { buildCompositeSegments, getPiecePoints, routePiecesAreAdjacent, type DerivedRoute, type RoutePiece } from '../editor/model';
import type { GpxPoint, GpxTrack } from '../gpx/types';

export interface ProjectGeometryState {
  tracks: GpxTrack[];
  selectedTrackId?: string;
  pieces: RoutePiece[];
}

export function getSelectedWorkingTrack(state: ProjectGeometryState): GpxTrack | undefined {
  return state.tracks.find((track) => track.id === state.selectedTrackId);
}

export function getCombinedRoute(pieces: RoutePiece[], tracks: GpxTrack[]): DerivedRoute {
  return { segments: buildCompositeSegments(pieces, tracks) };
}

export function combinedRoutePointCount(pieces: RoutePiece[], tracks: GpxTrack[]): number {
  return buildCompositeSegments(pieces, tracks).reduce((sum, segment) => sum + segment.points.length, 0);
}

function sameCoordinate(a: GpxPoint, b: GpxPoint): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}

export function getContinuousCombinedRoute(pieces: RoutePiece[], tracks: GpxTrack[]): GpxPoint[] | undefined {
  if (!pieces.length) return undefined;
  const route: GpxPoint[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const points = getPiecePoints(piece, tracks);
    if (points.length < 2) return undefined;
    if (index === 0) {
      route.push(...points.map((point) => ({ ...point })));
      continue;
    }
    const previousEnd = route.at(-1)!;
    if (sameCoordinate(previousEnd, points[0])) {
      route.push(...points.slice(1).map((point) => ({ ...point })));
      continue;
    }
    if (!routePiecesAreAdjacent(pieces[index - 1], piece)) return undefined;
    route.push(...points.map((point) => ({ ...point })));
  }
  return route.length >= 2 ? route : undefined;
}
