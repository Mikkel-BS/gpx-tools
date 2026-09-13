import type { RoutePiece } from '../editor/model';
import { parseGpx } from '../gpx/parser';
import { segmentsToCoordinateOnlyGpx } from '../gpx/serialize';
import type { GpxSegment, GpxTrack } from '../gpx/types';
import { defaultImageExportSettings, type ImageExportSettings } from '../export/settings';
import type { AppState, TrackSelection } from '../state/store';

export const PROJECT_FORMAT = 'gpx-tools-project';
export const PROJECT_VERSION = 2;

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
  image: ImageExportSettings;
}

interface ProjectTrackV2 {
  id: string;
  fileName: string;
  importedAt: number;
  /** Original imported GPX, preserved verbatim and kept as the canonical source representation. */
  originalXml: string;
  /** Present only when working geometry differs from the original. Standard coordinate-only GPX. */
  workingXml?: string;
}

interface ProjectWireV2 {
  format: typeof PROJECT_FORMAT;
  version: 2;
  savedAt: string;
  tracks: ProjectTrackV2[];
  selectedTrackId?: string;
  selection?: TrackSelection;
  pieces: RoutePiece[];
  selectedPieceId?: string;
  map: ProjectMapState;
  image: ImageExportSettings;
}

function segmentsEqual(a: GpxSegment[], b: GpxSegment[]): boolean {
  if (a.length !== b.length) return false;
  for (let segmentIndex = 0; segmentIndex < a.length; segmentIndex += 1) {
    const left = a[segmentIndex].points;
    const right = b[segmentIndex].points;
    if (left.length !== right.length) return false;
    for (let pointIndex = 0; pointIndex < left.length; pointIndex += 1) {
      if (left[pointIndex].lat !== right[pointIndex].lat || left[pointIndex].lon !== right[pointIndex].lon) return false;
    }
  }
  return true;
}

function cloneSelection(selection?: TrackSelection): TrackSelection | undefined {
  return selection ? { ...selection } : undefined;
}

function clonePiece(piece: RoutePiece): RoutePiece {
  return { ...piece };
}

function toWireTrack(track: GpxTrack): ProjectTrackV2 {
  const result: ProjectTrackV2 = {
    id: track.id,
    fileName: track.fileName,
    importedAt: track.importedAt,
    originalXml: track.originalXml,
  };
  if (!segmentsEqual(track.segments, track.originalSegments)) {
    result.workingXml = segmentsToCoordinateOnlyGpx(track.segments);
  }
  return result;
}

export function createProjectDocument(state: AppState, map: ProjectMapState, image = defaultImageExportSettings()): ProjectDocument {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    state: {
      tracks: state.tracks.map((track) => ({
        ...track,
        originalSegments: track.originalSegments.map((segment) => ({ points: segment.points.map((point) => ({ ...point })) })),
        segments: track.segments.map((segment) => ({ points: segment.points.map((point) => ({ ...point })) })),
      })),
      selectedTrackId: state.selectedTrackId,
      selection: cloneSelection(state.selection),
      pieces: state.pieces.map(clonePiece),
      selectedPieceId: state.selectedPieceId,
    },
    map: structuredClone(map),
    image: structuredClone(image),
  };
}

/** Project files are intentionally minified; embedded original GPX remains standard, recognizable GPX text. */
export function serializeProject(state: AppState, map: ProjectMapState, image = defaultImageExportSettings()): string {
  const wire: ProjectWireV2 = {
    format: PROJECT_FORMAT,
    version: 2,
    savedAt: new Date().toISOString(),
    tracks: state.tracks.map(toWireTrack),
    selectedTrackId: state.selectedTrackId,
    selection: cloneSelection(state.selection),
    pieces: state.pieces.map(clonePiece),
    selectedPieceId: state.selectedPieceId,
    map: structuredClone(map),
    image: structuredClone(image),
  };
  return `${JSON.stringify(wire)}\n`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function optionalString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
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

function piece(value: unknown, index: number): RoutePiece {
  const item = record(value, `pieces[${index}]`);
  if (typeof item.reversed !== 'boolean') throw new Error(`pieces[${index}].reversed must be boolean.`);
  return {
    id: stringValue(item.id, `pieces[${index}].id`),
    trackId: stringValue(item.trackId, `pieces[${index}].trackId`),
    segmentIndex: integer(item.segmentIndex, `pieces[${index}].segmentIndex`),
    startPointIndex: integer(item.startPointIndex, `pieces[${index}].startPointIndex`),
    endPointIndex: integer(item.endPointIndex, `pieces[${index}].endPointIndex`),
    startIndex: integer(item.startIndex, `pieces[${index}].startIndex`),
    endIndex: integer(item.endIndex, `pieces[${index}].endIndex`),
    reversed: item.reversed,
  };
}

function selection(value: unknown): TrackSelection | undefined {
  if (value === undefined || value === null) return undefined;
  const item = record(value, 'selection');
  return {
    trackId: stringValue(item.trackId, 'selection.trackId'),
    startIndex: integer(item.startIndex, 'selection.startIndex'),
    endIndex: integer(item.endIndex, 'selection.endIndex'),
  };
}

function layerState(value: unknown, label: string): ProjectLayerState {
  const item = record(value, label);
  if (typeof item.visible !== 'boolean') throw new Error(`${label}.visible must be boolean.`);
  const opacity = finiteNumber(item.opacity, `${label}.opacity`);
  if (opacity < 0 || opacity > 1) throw new Error(`${label}.opacity must be between 0 and 1.`);
  return { visible: item.visible, opacity };
}

function parseMap(value: unknown): ProjectMapState {
  const mapRaw = record(value, 'map');
  const layersRaw = record(mapRaw.layers, 'map.layers');
  return {
    baseProviderId: stringValue(mapRaw.baseProviderId, 'map.baseProviderId'),
    routeAppearanceId: stringValue(mapRaw.routeAppearanceId, 'map.routeAppearanceId'),
    layers: {
      base: layerState(layersRaw.base, 'map.layers.base'),
      tracks: layerState(layersRaw.tracks, 'map.layers.tracks'),
      combined: layerState(layersRaw.combined, 'map.layers.combined'),
      selection: layerState(layersRaw.selection, 'map.layers.selection'),
    },
  };
}

function bool(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }
function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function parseImage(value: unknown): ImageExportSettings {
  const defaults = defaultImageExportSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const item = value as Record<string, unknown>;
  const fitMode = item.fitMode === 'current' || item.fitMode === 'route' ? item.fitMode : defaults.fitMode;
  return {
    presetId: optionalString(item.presetId, defaults.presetId),
    layoutId: optionalString(item.layoutId, defaults.layoutId),
    widthMm: bounded(item.widthMm, defaults.widthMm, 10, 1000),
    heightMm: bounded(item.heightMm, defaults.heightMm, 10, 1000),
    dpi: bounded(item.dpi, defaults.dpi, 72, 600),
    includeBaseMap: bool(item.includeBaseMap, defaults.includeBaseMap),
    includeTracks: bool(item.includeTracks, defaults.includeTracks),
    includeCombinedRoute: bool(item.includeCombinedRoute, defaults.includeCombinedRoute),
    showScaleBar: bool(item.showScaleBar, defaults.showScaleBar),
    showNorthArrow: bool(item.showNorthArrow, defaults.showNorthArrow),
    fitMode,
    paddingPercent: bounded(item.paddingPercent, defaults.paddingPercent, 0, 35),
    backgroundColor: optionalString(item.backgroundColor, defaults.backgroundColor),
    border: bool(item.border, defaults.border),
    routeColor: optionalString(item.routeColor, defaults.routeColor),
    routeWidth: bounded(item.routeWidth, defaults.routeWidth, 1, 30),
    routeOpacity: bounded(item.routeOpacity, defaults.routeOpacity, 0, 1),
    routeHalo: bool(item.routeHalo, defaults.routeHalo),
    routeHaloColor: optionalString(item.routeHaloColor, defaults.routeHaloColor),
    routeHaloWidth: bounded(item.routeHaloWidth, defaults.routeHaloWidth, 1, 40),
    title: optionalString(item.title),
    subtitle: optionalString(item.subtitle),
    caption: optionalString(item.caption),
    showStartEndMarkers: bool(item.showStartEndMarkers, defaults.showStartEndMarkers),
  };
}

function validateState(state: AppState): void {
  if (state.tracks.length > 4) throw new Error('Project contains more than four tracks.');
  const trackIds = new Set(state.tracks.map((track) => track.id));
  if (trackIds.size !== state.tracks.length) throw new Error('Project contains duplicate track IDs.');
  for (const routePiece of state.pieces) {
    const source = state.tracks.find((item) => item.id === routePiece.trackId);
    const sourceSegment = source?.segments[routePiece.segmentIndex];
    if (!source || !sourceSegment) throw new Error('Project contains a route piece whose source track or segment is missing.');
    if (routePiece.startPointIndex < 0 || routePiece.endPointIndex < routePiece.startPointIndex || routePiece.endPointIndex >= sourceSegment.points.length) {
      throw new Error('Project contains a route piece with invalid point indexes.');
    }
  }
  if (state.selectedTrackId && !trackIds.has(state.selectedTrackId)) throw new Error('Selected track does not exist in this project.');
  if (state.selection && !trackIds.has(state.selection.trackId)) throw new Error('Selection references a missing track.');
  if (state.selectedPieceId && !state.pieces.some((item) => item.id === state.selectedPieceId)) throw new Error('Selected route piece does not exist in this project.');
}

function parseV2(root: Record<string, unknown>): ProjectDocument {
  if (!Array.isArray(root.tracks)) throw new Error('tracks must be an array.');
  const tracks: GpxTrack[] = root.tracks.map((value, index) => {
    const item = record(value, `tracks[${index}]`);
    const id = stringValue(item.id, `tracks[${index}].id`);
    const fileName = stringValue(item.fileName, `tracks[${index}].fileName`);
    const importedAt = finiteNumber(item.importedAt, `tracks[${index}].importedAt`);
    const originalXml = stringValue(item.originalXml, `tracks[${index}].originalXml`);
    const originalParsed = parseGpx(originalXml, fileName);
    let segments = originalParsed.segments;
    if (item.workingXml !== undefined) {
      const workingXml = stringValue(item.workingXml, `tracks[${index}].workingXml`);
      segments = parseGpx(workingXml, fileName).segments;
    }
    return {
      id,
      fileName,
      importedAt,
      originalXml,
      originalSegments: originalParsed.originalSegments,
      segments,
    };
  });
  const pieces = Array.isArray(root.pieces) ? root.pieces.map(piece) : (() => { throw new Error('pieces must be an array.'); })();
  const state: AppState = {
    tracks,
    selectedTrackId: root.selectedTrackId === undefined ? undefined : stringValue(root.selectedTrackId, 'selectedTrackId'),
    selection: selection(root.selection),
    pieces,
    selectedPieceId: root.selectedPieceId === undefined ? undefined : stringValue(root.selectedPieceId, 'selectedPieceId'),
  };
  validateState(state);
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: typeof root.savedAt === 'string' ? root.savedAt : '',
    state,
    map: parseMap(root.map),
    image: parseImage(root.image),
  };
}

/** Backward-compatible loader for v1 project files. New saves always use v2. */
function parseV1(root: Record<string, unknown>): ProjectDocument {
  const stateRaw = record(root.state, 'state');
  if (!Array.isArray(stateRaw.tracks)) throw new Error('state.tracks must be an array.');
  const tracks: GpxTrack[] = stateRaw.tracks.map((value, index) => {
    const item = record(value, `state.tracks[${index}]`);
    const fileName = stringValue(item.fileName, `state.tracks[${index}].fileName`);
    const originalXml = typeof item.originalXml === 'string' && item.originalXml ? item.originalXml : undefined;
    if (!originalXml) throw new Error('Legacy project track is missing its original GPX XML.');
    const originalParsed = parseGpx(originalXml, fileName);
    const legacySegments = item.segments;
    let workingSegments = originalParsed.segments;
    if (Array.isArray(legacySegments)) {
      const coordinateXml = segmentsToCoordinateOnlyGpx(legacySegments.map((segmentValue, segmentIndex) => {
        const segment = record(segmentValue, `state.tracks[${index}].segments[${segmentIndex}]`);
        if (!Array.isArray(segment.points)) throw new Error('Legacy project segment points are invalid.');
        return { points: segment.points.map((pointValue, pointIndex) => {
          const p = record(pointValue, `point ${pointIndex}`);
          const lat = finiteNumber(p.lat, 'lat');
          const lon = finiteNumber(p.lon, 'lon');
          return { lat, lon };
        }) };
      }));
      workingSegments = parseGpx(coordinateXml, fileName).segments;
    }
    return {
      id: stringValue(item.id, `state.tracks[${index}].id`),
      fileName,
      importedAt: finiteNumber(item.importedAt, `state.tracks[${index}].importedAt`),
      originalXml,
      originalSegments: originalParsed.originalSegments,
      segments: workingSegments,
    };
  });
  const pieces = Array.isArray(stateRaw.pieces) ? stateRaw.pieces.map(piece) : [];
  const state: AppState = {
    tracks,
    selectedTrackId: stateRaw.selectedTrackId === undefined ? undefined : stringValue(stateRaw.selectedTrackId, 'state.selectedTrackId'),
    selection: selection(stateRaw.selection),
    pieces,
    selectedPieceId: stateRaw.selectedPieceId === undefined ? undefined : stringValue(stateRaw.selectedPieceId, 'state.selectedPieceId'),
  };
  validateState(state);
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: typeof root.savedAt === 'string' ? root.savedAt : '',
    state,
    map: parseMap(root.map),
    image: defaultImageExportSettings(),
  };
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
  if (root.version === 2) return parseV2(root);
  if (root.version === 1) return parseV1(root);
  throw new Error(`Unsupported project version: ${String(root.version)}.`);
}
