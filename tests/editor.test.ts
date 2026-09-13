import { describe, expect, it } from 'vitest';
import {
  buildCompositeSegments,
  canSplitTrackAtFlatIndex,
  countJoinableSegmentBoundaries,
  createPiece,
  getPiecePoints,
  joinTouchingSegments,
  splitTrackAtFlatIndex,
} from '../src/editor/model';
import type { GpxPoint, GpxTrack } from '../src/gpx/types';
import { getContinuousCombinedRoute } from '../src/project/geometry';
import { parseProject, serializeProject, type ProjectMapState } from '../src/project/file';
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

const mapState: ProjectMapState = {
  baseProviderId: 'osm',
  routeAppearanceId: 'book-light',
  layers: {
    base: { visible: true, opacity: 1 },
    tracks: { visible: true, opacity: 0.8 },
    combined: { visible: true, opacity: 1 },
    selection: { visible: false, opacity: 0.5 },
  },
};

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

describe('explicit split and join editing', () => {
  const a = { lat: 60, lon: 10 };
  const b = { lat: 60.001, lon: 10.001 };
  const c = { lat: 60.002, lon: 10.002 };
  const d = { lat: 60.003, lon: 10.003 };

  it('splits only at an interior point and retains the split point in both segments', () => {
    const track = makeTrack('split', [[a, b, c, d]]);
    expect(canSplitTrackAtFlatIndex(track, 0)).toBe(false);
    expect(canSplitTrackAtFlatIndex(track, 2)).toBe(true);
    const split = splitTrackAtFlatIndex(track, 2);
    expect(split.segments).toHaveLength(2);
    expect(split.segments[0].points).toEqual([a, b, c]);
    expect(split.segments[1].points).toEqual([c, d]);
  });

  it('joins only exact touching adjacent segments and removes one duplicate boundary point', () => {
    const track = makeTrack('join', [[a, b], [b, c], [d]]);
    expect(countJoinableSegmentBoundaries(track)).toBe(1);
    const joined = joinTouchingSegments(track);
    expect(joined.segments).toHaveLength(2);
    expect(joined.segments[0].points).toEqual([a, b, c]);
    expect(joined.segments[1].points).toEqual([d]);
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

  it('makes split and join undoable while clearing stale route pieces for the edited track', () => {
    const store = new Store();
    const a = { lat: 60, lon: 10 };
    const b = { lat: 60.001, lon: 10.001 };
    const c = { lat: 60.002, lon: 10.002 };
    const track = makeTrack('edit', [[a, b, c]]);
    store.addTrack(track);
    store.addPiece(createPiece(track, 0, 2));
    store.setSelection(1, 1);
    store.splitSelectedTrackAtStart();
    expect(store.get().tracks[0].segments).toHaveLength(2);
    expect(store.get().pieces).toHaveLength(0);
    store.undo();
    expect(store.get().tracks[0].segments).toHaveLength(1);
    expect(store.get().pieces).toHaveLength(1);
  });
});

describe('local project files', () => {
  it('round-trips working geometry, route pieces and map settings', () => {
    const a = { lat: 60, lon: 10 };
    const b = { lat: 60.001, lon: 10.001 };
    const track = makeTrack('saved', [[a, b]]);
    const piece = createPiece(track, 0, 1);
    const text = serializeProject({
      tracks: [track],
      selectedTrackId: track.id,
      selection: { trackId: track.id, startIndex: 0, endIndex: 1 },
      pieces: [piece],
      selectedPieceId: piece.id,
    }, mapState);
    const project = parseProject(text);
    expect(project.state.tracks[0].segments[0].points).toEqual([a, b]);
    expect(project.state.pieces[0].segmentIndex).toBe(0);
    expect(project.map).toEqual(mapState);
  });

  it('rejects route pieces that reference missing source geometry', () => {
    const a = { lat: 60, lon: 10 };
    const b = { lat: 60.001, lon: 10.001 };
    const track = makeTrack('saved', [[a, b]]);
    const piece = createPiece(track, 0, 1);
    const raw = JSON.parse(serializeProject({ tracks: [track], pieces: [piece] }, mapState));
    raw.state.pieces[0].segmentIndex = 9;
    expect(() => parseProject(JSON.stringify(raw))).toThrow(/source track or segment is missing/i);
  });
});
