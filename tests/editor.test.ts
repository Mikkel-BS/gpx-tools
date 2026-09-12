import { describe, expect, it } from 'vitest';
import { buildCompositeSegments, createPiece, getPiecePoints } from '../src/editor/model';
import type { GpxPoint, GpxTrack } from '../src/gpx/types';
import { getContinuousCombinedRoute } from '../src/project/geometry';
import { Store } from '../src/state/store';

function makeTrack(id: string, segments: GpxPoint[][]): GpxTrack {
  const working = segments.map((points) => ({ points: points.map((point) => ({ ...point })) }));
  return {
    id,
    fileName: `${id}.gpx`,
    originalXml: '<gpx/>',
    originalSegments: working.map((segment) => ({ points: segment.points.map((point) => ({ ...point })) })),
    segments: working,
    importedAt: 0,
  };
}

describe('segment-aware route pieces', () => {
  const a = { lat: 60, lon: 10 };
  const b = { lat: 60.001, lon: 10.001 };
  const c = { lat: 61, lon: 11 };
  const d = { lat: 61.001, lon: 11.001 };

  it('stores the source segment explicitly instead of resolving geometry from flat indexes', () => {
    const track = makeTrack('multi', [[a, b], [c, d]]);
    const piece = createPiece(track, 2, 3);
    expect(piece.segmentIndex).toBe(1);
    expect(piece.startPointIndex).toBe(0);
    expect(piece.endPointIndex).toBe(1);
    expect(getPiecePoints(piece, [track])).toEqual([c, d]);
  });

  it('keeps combined route pieces as separate derived segments', () => {
    const first = makeTrack('first', [[a, b]]);
    const second = makeTrack('second', [[c, d]]);
    const pieces = [createPiece(first, 0, 1), createPiece(second, 0, 1)];
    const segments = buildCompositeSegments(pieces, [first, second]);
    expect(segments).toHaveLength(2);
    expect(segments[0].points).toEqual([a, b]);
    expect(segments[1].points).toEqual([c, d]);
    expect(getContinuousCombinedRoute(pieces, [first, second])).toBeUndefined();
  });

  it('recognizes explicit adjacency within one source segment', () => {
    const track = makeTrack('one', [[a, b, c, d]]);
    const pieces = [createPiece(track, 0, 1), createPiece(track, 2, 3)];
    expect(getContinuousCombinedRoute(pieces, [track])).toEqual([a, b, c, d]);
  });
});

describe('editor history boundaries', () => {
  it('clears edit history when the imported track set changes', () => {
    const store = new Store();
    const a = { lat: 60, lon: 10 };
    const b = { lat: 60.001, lon: 10.001 };
    const first = makeTrack('first', [[a, b]]);
    const second = makeTrack('second', [[a, b]]);
    store.addTrack(first);
    store.addPiece(createPiece(first, 0, 1));
    expect(store.canUndo()).toBe(true);
    store.addTrack(second);
    expect(store.canUndo()).toBe(false);
    store.addPiece(createPiece(first, 0, 1));
    expect(store.canUndo()).toBe(true);
    store.removeTrack(second.id);
    expect(store.canUndo()).toBe(false);
  });
});
