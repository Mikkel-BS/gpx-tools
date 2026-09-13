import 'ol/ol.css';
import './styles.css';
import { canSplitTrackAtFlatIndex, countJoinableSegmentBoundaries, createPiece, detectDiscontinuities, findSnapJoinCandidates, flattenTrack, getPiecePoints, indicesShareSegment } from './editor/model';
import { parseGpx } from './gpx/parser';
import { getTrackStats } from './gpx/stats';
import { segmentsToCoordinateOnlyGpx, toCoordinateOnlyGpx } from './gpx/serialize';
import { downloadText } from './export/download';
import { initMapImageExportUi } from './export/ui';
import { MapController, type MapLayerId } from './map/mapController';
import { rasterProviders } from './map/sources/providers';
import { vectorStyleProviders } from './map/sources/vectorStyles';
import { routeAppearancePresets } from './map/styles/presets';
import { initNtr1Ui } from './ntr1/ui';
import { combinedRoutePointCount, getCombinedRoute } from './project/geometry';
import { parseProject, serializeProject, type ProjectMapState } from './project/file';
import { store } from './state/store';

const app = document.querySelector<HTMLDivElement>('#app')!;
const rasterOptions = rasterProviders.map((provider) => `<option value="${provider.id}">${provider.label}</option>`).join('');
const vectorOptions = vectorStyleProviders.map((provider) => `<option value="${provider.id}">${provider.label}</option>`).join('');
const providerOptions = `<optgroup label="Raster maps">${rasterOptions}</optgroup><optgroup label="Curated vector styles">${vectorOptions}</optgroup>`;
const appearanceOptions = routeAppearancePresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
const layerIds: MapLayerId[] = ['base', 'tracks', 'combined', 'selection'];
const SNAP_JOIN_LIMIT_METERS = 10;

app.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <header><div class="eyebrow">LOCAL · CLIENT-SIDE</div><h1>GPX & Map Tool</h1><p>Edit and compose GPX tracks without uploading them.</p></header>
      <section>
        <h2>Project</h2>
        <input id="projectInput" type="file" accept=".json,application/json" hidden>
        <div class="button-row"><button id="openProject" class="secondary">Open project</button><button id="saveProject" class="secondary">Save project</button></div>
        <p class="hint">Project JSON stays local and restores source GPX, working edits, combined route, map settings and image composition.</p>
      </section>
      <section><h2>Tracks</h2><label class="import"><input id="fileInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" multiple><span>Import GPX files</span></label><p class="hint">Up to four files.</p><div id="trackList"></div></section>
      <section id="selectionSection">
        <h2>Edit selected track</h2>
        <p class="selection-instruction"><span class="handle-dot start"></span>Drag the green start handle and <span class="handle-dot end"></span>red end handle on the map.</p>
        <div class="range-grid"><label>Start point<input id="startIndex" type="number" min="0" step="1" value="0"></label><label>End point<input id="endIndex" type="number" min="0" step="1" value="0"></label></div>
        <p id="selectionHint" class="hint">Select a track first.</p>
        <div class="button-row"><button id="trimTrack" class="secondary" disabled>Trim to selection</button><button id="resetTrack" class="secondary" disabled>Reset track</button></div>
        <div class="button-row"><button id="splitTrack" class="secondary" disabled>Split at start point</button><button id="joinSegments" class="secondary" disabled>Auto-join exact</button></div>
        <button id="snapJoinSegments" class="secondary" disabled>Snap & join nearby segments</button>
        <button id="addPiece" class="primary" disabled>Add selection to combined route</button>
        <p class="hint">Auto-join only merges exact matching endpoints. Snap join is explicit: for an adjacent boundary within 10 m, it moves the second segment's first point onto the first segment's endpoint, then joins them. No connector line is invented. Editing a track clears combined-route pieces sourced from it.</p>
      </section>
      <section><div class="section-title"><h2>Combined route</h2><div class="history"><button id="undo" title="Undo" disabled>↶</button><button id="redo" title="Redo" disabled>↷</button></div></div><div id="pieceList"></div><div id="discontinuities" class="warnings"></div><button id="clearPieces" class="secondary" disabled>Clear route</button></section>
      <section class="map-controls">
        <h2>Map</h2>
        <label class="field-label">Map style<select id="baseMap">${providerOptions}</select></label>
        <p class="hint">Choose the underlying cartography independently. Curated vector styles load directly in your browser from OpenFreeMap.</p>
        <label class="field-label">Route appearance<select id="routeAppearance">${appearanceOptions}</select></label>
        <p class="hint">Controls GPX, combined-route and selection colors and line weights without changing the map style.</p>
        <div class="layer-list layer-visibility-list" aria-label="Map layer visibility">
          <div class="layer-row"><label><input type="checkbox" data-layer-visible="base" checked><span>Base map</span></label></div>
          <div class="layer-row"><label><input type="checkbox" data-layer-visible="tracks" checked><span>Imported tracks</span></label></div>
          <div class="layer-row"><label><input type="checkbox" data-layer-visible="combined" checked><span>Combined route</span></label></div>
          <div class="layer-row"><label><input type="checkbox" data-layer-visible="selection" checked><span>Selection/edit handles</span></label></div>
        </div>
        <details class="layer-settings">
          <summary>Layer opacity</summary>
          <div class="opacity-list">
            <label><span>Base map</span><input type="range" min="0" max="100" value="100" data-layer-opacity="base" aria-label="Base map opacity"></label>
            <label><span>Imported tracks</span><input type="range" min="0" max="100" value="100" data-layer-opacity="tracks" aria-label="Imported tracks opacity"></label>
            <label><span>Combined route</span><input type="range" min="0" max="100" value="100" data-layer-opacity="combined" aria-label="Combined route opacity"></label>
            <label><span>Selection/edit handles</span><input type="range" min="0" max="100" value="100" data-layer-opacity="selection" aria-label="Selection opacity"></label>
          </div>
        </details>
      </section>
      <section class="export-share">
        <h2>Export & share</h2>
        <div class="export-tool export-gpx">
          <h3>GPX</h3>
          <button id="cleanExport" class="secondary" disabled>Selected working track · coordinate-only</button>
          <button id="routeExport" class="primary" disabled>Combined route · coordinate-only</button>
          <p class="hint">Disconnected route pieces remain separate GPX track segments; no missing geometry is generated.</p>
        </div>
        <div id="imageExportRoot" class="export-tool"></div>
        <div id="ntr1Root" class="export-tool"></div>
      </section>
    </aside>
    <section class="map-panel"><div id="map"></div><div id="status" class="status">No tracks loaded</div></section>
  </main>`;

const map = new MapController(document.querySelector<HTMLElement>('#map')!);
const imageExport = initMapImageExportUi(document.querySelector<HTMLElement>('#imageExportRoot')!, {
  map,
  getState: () => store.get(),
});
initNtr1Ui(document.querySelector<HTMLElement>('#ntr1Root')!, {
  getState: () => store.get(),
  addTrack: (track) => store.addTrack(track),
  setMapPreview: (points) => map.setNtr1Preview(points),
});

const input = document.querySelector<HTMLInputElement>('#fileInput')!;
const projectInput = document.querySelector<HTMLInputElement>('#projectInput')!;
const openProjectBtn = document.querySelector<HTMLButtonElement>('#openProject')!;
const saveProjectBtn = document.querySelector<HTMLButtonElement>('#saveProject')!;
const list = document.querySelector<HTMLDivElement>('#trackList')!;
const pieceList = document.querySelector<HTMLDivElement>('#pieceList')!;
const startInput = document.querySelector<HTMLInputElement>('#startIndex')!;
const endInput = document.querySelector<HTMLInputElement>('#endIndex')!;
const addPieceBtn = document.querySelector<HTMLButtonElement>('#addPiece')!;
const trimTrackBtn = document.querySelector<HTMLButtonElement>('#trimTrack')!;
const resetTrackBtn = document.querySelector<HTMLButtonElement>('#resetTrack')!;
const splitTrackBtn = document.querySelector<HTMLButtonElement>('#splitTrack')!;
const joinSegmentsBtn = document.querySelector<HTMLButtonElement>('#joinSegments')!;
const snapJoinSegmentsBtn = document.querySelector<HTMLButtonElement>('#snapJoinSegments')!;
const selectionHint = document.querySelector<HTMLParagraphElement>('#selectionHint')!;
const cleanExportBtn = document.querySelector<HTMLButtonElement>('#cleanExport')!;
const routeExportBtn = document.querySelector<HTMLButtonElement>('#routeExport')!;
const clearPiecesBtn = document.querySelector<HTMLButtonElement>('#clearPieces')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo')!;
const discontinuitiesEl = document.querySelector<HTMLDivElement>('#discontinuities')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const baseMapSelect = document.querySelector<HTMLSelectElement>('#baseMap')!;
const routeAppearanceSelect = document.querySelector<HTMLSelectElement>('#routeAppearance')!;

const visibleControl = (layerId: MapLayerId) => document.querySelector<HTMLInputElement>(`[data-layer-visible="${layerId}"]`)!;
const opacityControl = (layerId: MapLayerId) => document.querySelector<HTMLInputElement>(`[data-layer-opacity="${layerId}"]`)!;

function captureProjectMapState(): ProjectMapState {
  const layer = (layerId: MapLayerId) => ({
    visible: visibleControl(layerId).checked,
    opacity: Number(opacityControl(layerId).value) / 100,
  });
  return {
    baseProviderId: baseMapSelect.value,
    routeAppearanceId: routeAppearanceSelect.value,
    layers: {
      base: layer('base'),
      tracks: layer('tracks'),
      combined: layer('combined'),
      selection: layer('selection'),
    },
  };
}

async function applyProjectMapState(projectMap: ProjectMapState): Promise<void> {
  const hasBase = Array.from(baseMapSelect.options).some((option) => option.value === projectMap.baseProviderId);
  const hasAppearance = Array.from(routeAppearanceSelect.options).some((option) => option.value === projectMap.routeAppearanceId);
  if (!hasBase || !hasAppearance) throw new Error('Project refers to a map style or route appearance that is not available in this version.');
  await map.setBaseProvider(projectMap.baseProviderId);
  baseMapSelect.value = projectMap.baseProviderId;
  map.setRouteAppearance(projectMap.routeAppearanceId);
  routeAppearanceSelect.value = projectMap.routeAppearanceId;
  for (const layerId of layerIds) {
    const saved = projectMap.layers[layerId];
    map.setLayerVisibility(layerId, saved.visible);
    map.setLayerOpacity(layerId, saved.opacity);
    visibleControl(layerId).checked = saved.visible;
    opacityControl(layerId).value = String(Math.round(saved.opacity * 100));
  }
}

map.setRouteAppearance(routeAppearanceSelect.value);
baseMapSelect.value = map.getBaseProviderId();

openProjectBtn.addEventListener('click', () => projectInput.click());
saveProjectBtn.addEventListener('click', () => {
  downloadText('gpx-tools-project.json', serializeProject(store.get(), captureProjectMapState(), imageExport.getSettings()));
});
projectInput.addEventListener('change', async () => {
  const file = projectInput.files?.[0];
  projectInput.value = '';
  if (!file) return;
  try {
    const project = parseProject(await file.text());
    await applyProjectMapState(project.map);
    imageExport.applySettings(project.image);
    store.replaceState(project.state);
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
});

input.addEventListener('change', async () => {
  const files = Array.from(input.files ?? []);
  for (const file of files) {
    try {
      if (store.get().tracks.length >= 4) throw new Error('Only four GPX files can be loaded at once.');
      store.addTrack(parseGpx(await file.text(), file.name));
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
      break;
    }
  }
  input.value = '';
});

baseMapSelect.addEventListener('change', () => {
  const requested = baseMapSelect.value;
  baseMapSelect.disabled = true;
  void map.setBaseProvider(requested).catch((error) => {
    alert(error instanceof Error ? error.message : String(error));
    baseMapSelect.value = map.getBaseProviderId();
  }).finally(() => {
    baseMapSelect.disabled = false;
  });
});
routeAppearanceSelect.addEventListener('change', () => map.setRouteAppearance(routeAppearanceSelect.value));

document.querySelectorAll<HTMLInputElement>('[data-layer-visible]').forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    map.setLayerVisibility(checkbox.dataset.layerVisible as MapLayerId, checkbox.checked);
  });
});

document.querySelectorAll<HTMLInputElement>('[data-layer-opacity]').forEach((slider) => {
  slider.addEventListener('input', () => {
    map.setLayerOpacity(slider.dataset.layerOpacity as MapLayerId, Number(slider.value) / 100);
  });
});

const updateSelectionFromInputs = () => store.setSelection(Number(startInput.value), Number(endInput.value));
startInput.addEventListener('change', updateSelectionFromInputs);
endInput.addEventListener('change', updateSelectionFromInputs);

map.onSelectionChange((handle, index) => {
  const selection = store.get().selection;
  if (!selection) return;
  if (handle === 'start') store.setSelection(index, selection.endIndex);
  else store.setSelection(selection.startIndex, index);
});

addPieceBtn.addEventListener('click', () => {
  const state = store.get();
  const track = state.tracks.find((item) => item.id === state.selectedTrackId);
  const selection = state.selection;
  if (!track || !selection) return;
  try {
    store.addPiece(createPiece(track, selection.startIndex, selection.endIndex));
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
});

trimTrackBtn.addEventListener('click', () => {
  try {
    store.trimSelectedTrack();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
});
resetTrackBtn.addEventListener('click', () => store.resetSelectedTrack());
splitTrackBtn.addEventListener('click', () => {
  try {
    store.splitSelectedTrackAtStart();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
});
joinSegmentsBtn.addEventListener('click', () => {
  try {
    store.joinTouchingSelectedTrackSegments();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
});
snapJoinSegmentsBtn.addEventListener('click', () => {
  const state = store.get();
  const track = state.tracks.find((item) => item.id === state.selectedTrackId);
  const candidate = track ? findSnapJoinCandidates(track, SNAP_JOIN_LIMIT_METERS)[0] : undefined;
  if (!candidate) return;
  const leftSegment = candidate.boundaryIndex + 1;
  const rightSegment = candidate.boundaryIndex + 2;
  const distance = candidate.distanceMeters.toFixed(candidate.distanceMeters < 1 ? 2 : 1);
  const approved = window.confirm(
    `Segments ${leftSegment} and ${rightSegment} end ${distance} m apart.\n\n` +
    `Snap the start of segment ${rightSegment} onto the end of segment ${leftSegment} and join them?\n\n` +
    'This moves one recorded endpoint. No connector line will be created, and the edit can be undone.'
  );
  if (!approved) return;
  try {
    store.snapJoinSelectedTrackSegments(candidate.boundaryIndex, SNAP_JOIN_LIMIT_METERS);
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  }
});

cleanExportBtn.addEventListener('click', () => {
  const state = store.get();
  const track = state.tracks.find((item) => item.id === state.selectedTrackId);
  if (!track) return;
  const stem = track.fileName.replace(/\.gpx$/i, '');
  downloadText(`${stem}-coordinates-only.gpx`, toCoordinateOnlyGpx(track));
});

routeExportBtn.addEventListener('click', () => {
  const state = store.get();
  const route = getCombinedRoute(state.pieces, state.tracks);
  if (!route.segments.length) return;
  downloadText('combined-route.gpx', segmentsToCoordinateOnlyGpx(route.segments));
});

clearPiecesBtn.addEventListener('click', () => store.clearPieces());
undoBtn.addEventListener('click', () => store.undo());
redoBtn.addEventListener('click', () => store.redo());

store.subscribe((state) => {
  const selectedTrack = state.tracks.find((track) => track.id === state.selectedTrackId);
  const selection = state.selection?.trackId === selectedTrack?.id ? state.selection : undefined;
  const compositePointCount = combinedRoutePointCount(state.pieces, state.tracks);
  map.setTracks(state.tracks, state.selectedTrackId);
  map.setComposite(state.pieces, state.tracks, state.selectedPieceId);
  map.setSelection(selectedTrack, selection?.startIndex ?? 0, selection?.endIndex ?? 0);

  const selectionWithinSegment = Boolean(selectedTrack && selection && indicesShareSegment(selectedTrack, selection.startIndex, selection.endIndex));
  const splitAvailable = Boolean(selectedTrack && selection && canSplitTrackAtFlatIndex(selectedTrack, selection.startIndex));
  const joinableBoundaries = selectedTrack ? countJoinableSegmentBoundaries(selectedTrack) : 0;
  const snapCandidate = selectedTrack ? findSnapJoinCandidates(selectedTrack, SNAP_JOIN_LIMIT_METERS)[0] : undefined;
  cleanExportBtn.disabled = !selectedTrack;
  routeExportBtn.disabled = compositePointCount < 2;
  clearPiecesBtn.disabled = state.pieces.length === 0;
  undoBtn.disabled = !store.canUndo();
  redoBtn.disabled = !store.canRedo();
  addPieceBtn.disabled = !selectedTrack || !selection || selection.startIndex === selection.endIndex || !selectionWithinSegment;
  trimTrackBtn.disabled = !selectedTrack || !selection || selection.startIndex === selection.endIndex || !selectionWithinSegment;
  resetTrackBtn.disabled = !selectedTrack || !selectedTrack.originalSegments;
  splitTrackBtn.disabled = !splitAvailable;
  joinSegmentsBtn.disabled = joinableBoundaries === 0;
  joinSegmentsBtn.textContent = joinableBoundaries > 1 ? `Auto-join exact (${joinableBoundaries})` : 'Auto-join exact';
  snapJoinSegmentsBtn.disabled = !snapCandidate;
  snapJoinSegmentsBtn.textContent = snapCandidate
    ? `Snap & join nearby (${snapCandidate.distanceMeters.toFixed(snapCandidate.distanceMeters < 1 ? 2 : 1)} m)`
    : 'Snap & join nearby segments';

  if (selectedTrack && selection) {
    const pointCount = flattenTrack(selectedTrack).length;
    startInput.max = String(Math.max(0, pointCount - 1));
    endInput.max = String(Math.max(0, pointCount - 1));
    startInput.value = String(selection.startIndex);
    endInput.value = String(selection.endIndex);
    const selectedCount = Math.abs(selection.endIndex - selection.startIndex) + 1;
    selectionHint.textContent = selectionWithinSegment
      ? `${selectedCount.toLocaleString()} of ${pointCount.toLocaleString()} points selected${selection.startIndex > selection.endIndex ? ' · route piece will be reversed' : ''}.`
      : 'Selection crosses a GPX track-segment boundary. Trim and route-piece actions require one segment.';
  } else {
    startInput.value = '0';
    endInput.value = '0';
    selectionHint.textContent = 'Select a track first.';
  }

  status.textContent = state.tracks.length
    ? `${state.tracks.length} track${state.tracks.length === 1 ? '' : 's'} · ${state.pieces.length} route piece${state.pieces.length === 1 ? '' : 's'}`
    : 'No tracks loaded';

  list.replaceChildren(...state.tracks.map((track) => {
    const stats = getTrackStats(track);
    const originalPoints = track.originalSegments.reduce((sum, segment) => sum + segment.points.length, 0);
    const isTrimmed = stats.points !== originalPoints;
    const card = document.createElement('div');
    card.className = `track-card ${track.id === state.selectedTrackId ? 'selected' : ''}`;
    const main = document.createElement('button');
    main.className = 'track-main';
    const strong = document.createElement('strong');
    strong.textContent = track.fileName;
    const meta = document.createElement('span');
    meta.textContent = `${stats.points.toLocaleString()} pts · ${(stats.distanceMeters / 1000).toFixed(1)} km · ${stats.segments} seg${isTrimmed ? ' · trimmed' : ''}`;
    main.append(strong, meta);
    main.onclick = () => store.setSelectedTrack(track.id);
    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${track.fileName}`);
    remove.onclick = () => store.removeTrack(track.id);
    card.append(main, remove);
    return card;
  }));

  pieceList.replaceChildren(...state.pieces.map((piece, index) => {
    const track = state.tracks.find((item) => item.id === piece.trackId);
    const count = getPiecePoints(piece, state.tracks).length;
    const card = document.createElement('div');
    card.className = `piece-card ${piece.id === state.selectedPieceId ? 'selected' : ''}`;
    card.onclick = () => store.selectPiece(piece.id);
    const info = document.createElement('div');
    info.className = 'piece-info';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${track?.fileName ?? 'Missing track'}`;
    const meta = document.createElement('span');
    meta.textContent = `segment ${piece.segmentIndex + 1} · ${piece.startPointIndex.toLocaleString()}–${piece.endPointIndex.toLocaleString()} · ${count.toLocaleString()} pts${piece.reversed ? ' · reversed' : ''}`;
    info.append(title, meta);
    const controls = document.createElement('div');
    controls.className = 'piece-controls';
    controls.onclick = (event) => event.stopPropagation();
    const makeButton = (label: string, titleText: string, action: () => void, disabled = false) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.title = titleText;
      button.disabled = disabled;
      button.onclick = action;
      return button;
    };
    controls.append(
      makeButton('↑', 'Move up', () => store.movePiece(piece.id, -1), index === 0),
      makeButton('↓', 'Move down', () => store.movePiece(piece.id, 1), index === state.pieces.length - 1),
      makeButton('⇄', 'Reverse section', () => store.reversePiece(piece.id)),
      makeButton('×', 'Remove section', () => store.removePiece(piece.id)),
    );
    card.append(info, controls);
    return card;
  }));

  const gaps = detectDiscontinuities(state.pieces, state.tracks);
  discontinuitiesEl.replaceChildren(...gaps.map((gap) => {
    const note = document.createElement('div');
    const after = state.pieces.findIndex((piece) => piece.id === gap.afterPieceId) + 1;
    note.textContent = `Gap after piece ${after}: ${(gap.distanceMeters / 1000).toFixed(gap.distanceMeters >= 1000 ? 2 : 3)} km`;
    return note;
  }));
});
