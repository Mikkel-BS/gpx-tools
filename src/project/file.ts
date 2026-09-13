import type { RoutePiece } from '../editor/model';
import type { GpxPoint, GpxSegment, GpxTrack } from '../gpx/types';
import type { AppState, TrackSelection } from '../state/store';

export const PROJECT_FORMAT = 'gpx-tools-project';
export const PROJECT_VERSION = 1;

export interface ProjectLayerState {
  visible: boolean;
  opacity: number;
}

export interface ProjectMapState {
  baseProviderId: string;
  routeAppearanceId: string;
  layers: {
    base: ProjectLayerState;
    tracks: ProjectLayerState;
    combined: ProjectLayerState;
    selection: ProjectLayerState;
  };
}

export interface ProjectDocument {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  savedAt: string;
  state: AppState;
  map: ProjectMapState;
}

function clonePoint(point: GpxPoint): GpxPoint {
  return { lat: point.lat, lon: point.lon };
}

function cloneSegments(segments: GpxSegment[]): GpxSegment[] {
  return segments.map((segment) => ({ points: segment.points.map(clonePoint) }));
}

function cloneTrack(track: GpxTrack): GpxTrack {
  return {
    ...track,
    originalSegments: cloneSegments(track.originalSegments),
    segments: cloneSegments(track.segments),
  };
}

function clonePiece(piece: RoutePiece): RoutePiece {
  return { ...piece };
}

function cloneSelection(selection?: TrackSelection): TrackSelection | undefined {
  return selection ? { ...selection } : undefined;
}

export function createProjectDocument(state: AppState, map: ProjectMapState): ProjectDocument {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    state: {
      tracks: state.tracks.map(cloneTrack),
      selectedTrackId: state.selectedTrackId,
      selection: cloneSelection(state.selection),
      pieces: state.pieces.map(clonePiece),
      selectedPieceId: state.selectedPieceId,
    },
    map: JSON.parse(JSON.stringify(map)) as ProjectMapState,
  };
}

export function serializeProject(state: AppState, map: ProjectMapState): string {
  return `${JSON.stringify(createProjectDocument(state, map), null, 2)}\n`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function integer(value: unknown, label: string): number {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer.`);
  return number;
}

function point(value: unknown, label: string): GpxPoint {
  const item = record(value, label);
  const lat = finiteNumber(item.lat, `${label}.lat`);
  const lon = finiteNumber(item.lon, `${label}.lon`);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error(`${label} is outside valid latitude/longitude bounds.`);
  return { lat, lon };
}

function segments(value: unknown, label: string): GpxSegment[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((segmentValue, segmentIndex) => {
    const segment = record(segmentValue, `${label}[${segmentIndex}]`);
    if (!Array.isArray(segment.points)) throw new Error(`${label}[${segmentIndex}].points must be an array.`);
    return { points: segment.points.map((item, pointIndex) => point(item, `${label}[${segmentIndex}].points[${pointIndex}]`)) };
  });
}

function track(value: unknown, index: number): GpxTrack {
  const item = record(value, `state.tracks[${index}]`);
  return {
    id: stringValue(item.id, `state.tracks[${index}].id`),
    fileName: stringValue(item.fileName, `state.tracks[${index}].fileName`),
    originalXml: typeof item.originalXml === 'string' ? item.originalXml : '',
    originalSegments: segments(item.originalSegments, `state.tracks[${index}].originalSegments`),
    segments: segments(item.segments, `state.tracks[${index}].segments`),
    importedAt: finiteNumber(item.importedAt, `state.tracks[${index}].importedAt`),
  };
}

function piece(value: unknown, index: number): RoutePiece {
  const item = record(value, `state.pieces[${index}]`);
  if (typeof item.reversed !== 'boolean') throw new Error(`state.pieces[${index}].reversed must be boolean.`);
  return {
    id: stringValue(item.id, `state.pieces[${index}].id`),
    trackId: stringValue(item.trackId, `state.pieces[${index}].trackId`),
    segmentIndex: integer(item.segmentIndex, `state.pieces[${index}].segmentIndex`),
    startPointIndex: integer(item.startPointIndex, `state.pieces[${index}].startPointIndex`),
    endPointIndex: integer(item.endPointIndex, `state.pieces[${index}].endPointIndex`),
    startIndex: integer(item.startIndex, `state.pieces[${index}].startIndex`),
    endIndex: integer(item.endIndex, `state.pieces[${index}].endIndex`),
    reversed: item.reversed,
  };
}

function selection(value: unknown): TrackSelection | undefined {
  if (value === undefined || value === null) return undefined;
  const item = record(value, 'state.selection');
  return {
    trackId: stringValue(item.trackId, 'state.selection.trackId'),
    startIndex: integer(item.startIndex, 'state.selection.startIndex'),
    endIndex: integer(item.endIndex, 'state.selection.endIndex'),
  };
}

function layerState(value: unknown, label: string): ProjectLayerState {
  const item = record(value, label);
  if (typeof item.visible !== 'boolean') throw new Error(`${label}.visible must be boolean.`);
  const opacity = finiteNumber(item.opacity, `${label}.opacity`);
  if (opacity < 0 || opacity > 1) throw new Error(`${label}.opacity must be between 0 and 1.`);
  return { visible: item.visible, opacity };
}

export function parseProject(text: string): ProjectDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Project file is not valid JSON.');
  }
  const root = record(parsed, 'Project');
  if (root.format !== PROJECT_FORMAT) throw new Error('This is not a GPX & Map Tool project file.');
  if (root.version !== PROJECT_VERSION) throw new Error(`Unsupported project version: ${String(root.version)}.`);

  const stateRaw = record(root.state, 'state');
  if (!Array.isArray(stateRaw.tracks)) throw new Error('state.tracks must be an array.');
  if (stateRaw.tracks.length > 4) throw new Error('Project contains more than four tracks.');
  if (!Array.isArray(stateRaw.pieces)) throw new Error('state.pieces must be an array.');
  const tracks = stateRaw.tracks.map(track);
  const trackIds = new Set(tracks.map((item) => item.id));
  if (trackIds.size !== tracks.length) throw new Error('Project contains duplicate track IDs.');
  const pieces = stateRaw.pieces.map(piece);
  for (const routePiece of pieces) {
    const source = tracks.find((item) => item.id === routePiece.trackId);
    const sourceSegment = source?.segments[routePiece.segmentIndex];
    if (!source || !sourceSegment) throw new Error('Project contains a route piece whose source track or segment is missing.');
    if (routePiece.startPointIndex < 0 || routePiece.endPointIndex < routePiece.startPointIndex || routePiece.endPointIndex >= sourceSegment.points.length) {
      throw new Error('Project contains a route piece with invalid point indexes.');
    }
  }

  const selectedTrackId = stateRaw.selectedTrackId === undefined ? undefined : stringValue(stateRaw.selectedTrackId, 'state.selectedTrackId');
  if (selectedTrackId && !trackIds.has(selectedTrackId)) throw new Error('Selected track does not exist in this project.');
  const parsedSelection = selection(stateRaw.selection);
  if (parsedSelection && !trackIds.has(parsedSelection.trackId)) throw new Error('Selection references a missing track.');
  const selectedPieceId = stateRaw.selectedPieceId === undefined ? undefined : stringValue(stateRaw.selectedPieceId, 'state.selectedPieceId');
  if (selectedPieceId && !pieces.some((item) => item.id === selectedPieceId)) throw new Error('Selected route piece does not exist in this project.');

  const mapRaw = record(root.map, 'map');
  const layersRaw = record(mapRaw.layers, 'map.layers');
  const map: ProjectMapState = {
    baseProviderId: stringValue(mapRaw.baseProviderId, 'map.baseProviderId'),
    routeAppearanceId: stringValue(mapRaw.routeAppearanceId, 'map.routeAppearanceId'),
    layers: {
      base: layerState(layersRaw.base, 'map.layers.base'),
      tracks: layerState(layersRaw.tracks, 'map.layers.tracks'),
      combined: layerState(layersRaw.combined, 'map.layers.combined'),
      selection: layerState(layersRaw.selection, 'map.layers.selection'),
    },
  };

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: typeof root.savedAt === 'string' ? root.savedAt : '',
    state: { tracks, selectedTrackId, selection: parsedSelection, pieces, selectedPieceId },
    map,
  };
}
