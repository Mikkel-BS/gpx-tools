import 'ol/ol.css';
import './styles.css';
import { buildComposite, createPiece, detectDiscontinuities, flattenTrack, getPiecePoints } from './editor/model';
import { parseGpx } from './gpx/parser';
import { getTrackStats } from './gpx/stats';
import { segmentsToCoordinateOnlyGpx, toCoordinateOnlyGpx } from './gpx/serialize';
import { downloadText } from './export/download';
import { MapController, type MapLayerId } from './map/mapController';
import { rasterProviders } from './map/sources/providers';
import { cartographicPresets } from './map/styles/presets';
import { store } from './state/store';

const app = document.querySelector<HTMLDivElement>('#app')!;
const providerOptions = rasterProviders.map((provider) => `<option value="${provider.id}">${provider.label}</option>`).join('');
const styleOptions = cartographicPresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');

app.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <header><div class="eyebrow">LOCAL · CLIENT-SIDE</div><h1>GPX & Map Tool</h1><p>Edit and compose GPX tracks without uploading them.</p></header>
      <section><h2>Tracks</h2><label class="import"><input id="fileInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" multiple><span>Import GPX files</span></label><p class="hint">Up to four files.</p><div id="trackList"></div></section>
      <section id="selectionSection">
        <h2>Edit selected track</h2>
        <p class="selection-instruction"><span class="handle-dot start"></span>Drag the green start handle and <span class="handle-dot end"></span>red end handle on the map.</p>
        <div class="range-grid"><label>Start point<input id="startIndex" type="number" min="0" step="1" value="0"></label><label>End point<input id="endIndex" type="number" min="0" step="1" value="0"></label></div>
        <p id="selectionHint" class="hint">Select a track first.</p>
        <div class="button-row"><button id="trimTrack" class="secondary" disabled>Trim to selection</button><button id="resetTrack" class="secondary" disabled>Reset track</button></div>
        <button id="addPiece" class="primary" disabled>Add selection to combined route</button>
        <p class="hint">Trimming changes only the in-browser working copy. The imported original is retained for reset.</p>
      </section>
      <section><div class="section-title"><h2>Combined route</h2><div class="history"><button id="undo" title="Undo" disabled>↶</button><button id="redo" title="Redo" disabled>↷</button></div></div><div id="pieceList"></div><div id="discontinuities" class="warnings"></div><button id="clearPieces" class="secondary" disabled>Clear route</button></section>
      <section class="map-controls">
        <h2>Map</h2>
        <label class="field-label">Base map<select id="baseMap">${providerOptions}</select></label>
        <label class="field-label">Cartographic style<select id="stylePreset">${styleOptions}</select></label>
        <div class="layer-list" aria-label="Map layers">
          <div class="layer-row"><label><input type="checkbox" data-layer-visible="base" checked><span>Base map</span></label><input type="range" min="0" max="100" value="100" data-layer-opacity="base" aria-label="Base map opacity"></div>
          <div class="layer-row"><label><input type="checkbox" data-layer-visible="tracks" checked><span>Imported tracks</span></label><input type="range" min="0" max="100" value="100" data-layer-opacity="tracks" aria-label="Imported tracks opacity"></div>
          <div class="layer-row"><label><input type="checkbox" data-layer-visible="combined" checked><span>Combined route</span></label><input type="range" min="0" max="100" value="100" data-layer-opacity="combined" aria-label="Combined route opacity"></div>
          <div class="layer-row"><label><input type="checkbox" data-layer-visible="selection" checked><span>Selection/edit handles</span></label><input type="range" min="0" max="100" value="100" data-layer-opacity="selection" aria-label="Selection opacity"></div>
        </div>
        <p class="hint">Map sources are configured separately from overlays. Style presets currently affect GPX/project overlays; raster basemap cartography remains provider-defined.</p>
      </section>
      <section><h2>Export</h2><button id="cleanExport" class="secondary" disabled>Selected working track · coordinate-only</button><button id="routeExport" class="primary" disabled>Combined route · coordinate-only</button><p class="hint">Disconnected route pieces remain separate GPX track segments; no missing geometry is generated.</p></section>
    </aside>
    <section class="map-panel"><div id="map"></div><div id="status" class="status">No tracks loaded</div></section>
  </main>`;

const map = new MapController(document.querySelector<HTMLElement>('#map')!);
const input = document.querySelector<HTMLInputElement>('#fileInput')!;
const list = document.querySelector<HTMLDivElement>('#trackList')!;
const pieceList = document.querySelector<HTMLDivElement>('#pieceList')!;
const startInput = document.querySelector<HTMLInputElement>('#startIndex')!;
const endInput = document.querySelector<HTMLInputElement>('#endIndex')!;
const addPieceBtn = document.querySelector<HTMLButtonElement>('#addPiece')!;
const trimTrackBtn = document.querySelector<HTMLButtonElement>('#trimTrack')!;
const resetTrackBtn = document.querySelector<HTMLButtonElement>('#resetTrack')!;
const selectionHint = document.querySelector<HTMLParagraphElement>('#selectionHint')!;
const cleanExportBtn = document.querySelector<HTMLButtonElement>('#cleanExport')!;
const routeExportBtn = document.querySelector<HTMLButtonElement>('#routeExport')!;
const clearPiecesBtn = document.querySelector<HTMLButtonElement>('#clearPieces')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo')!;
const discontinuitiesEl = document.querySelector<HTMLDivElement>('#discontinuities')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const baseMapSelect = document.querySelector<HTMLSelectElement>('#baseMap')!;
const stylePresetSelect = document.querySelector<HTMLSelectElement>('#stylePreset')!;

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

baseMapSelect.addEventListener('change', () => map.setBaseProvider(baseMapSelect.value));
stylePresetSelect.addEventListener('change', () => map.setStylePreset(stylePresetSelect.value));

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

cleanExportBtn.addEventListener('click', () => {
  const state = store.get();
  const track = state.tracks.find((item) => item.id === state.selectedTrackId);
  if (!track) return;
  const stem = track.fileName.replace(/\.gpx$/i, '');
  downloadText(`${stem}-coordinates-only.gpx`, toCoordinateOnlyGpx(track));
});

routeExportBtn.addEventListener('click', () => {
  const state = store.get();
  const segments = state.pieces
    .map((piece) => ({ points: getPiecePoints(piece, state.tracks) }))
    .filter((segment) => segment.points.length >= 2);
  if (!segments.length) return;
  downloadText('combined-route.gpx', segmentsToCoordinateOnlyGpx(segments));
});

clearPiecesBtn.addEventListener('click', () => store.clearPieces());
undoBtn.addEventListener('click', () => store.undo());
redoBtn.addEventListener('click', () => store.redo());

store.subscribe((state) => {
  const selectedTrack = state.tracks.find((track) => track.id === state.selectedTrackId);
  const selection = state.selection?.trackId === selectedTrack?.id ? state.selection : undefined;
  const composite = buildComposite(state.pieces, state.tracks);
  map.setTracks(state.tracks, state.selectedTrackId);
  map.setComposite(state.pieces, state.tracks, state.selectedPieceId);
  map.setSelection(selectedTrack, selection?.startIndex ?? 0, selection?.endIndex ?? 0);

  cleanExportBtn.disabled = !selectedTrack;
  routeExportBtn.disabled = composite.length < 2;
  clearPiecesBtn.disabled = state.pieces.length === 0;
  undoBtn.disabled = !store.canUndo();
  redoBtn.disabled = !store.canRedo();
  addPieceBtn.disabled = !selectedTrack || !selection || selection.startIndex === selection.endIndex;
  trimTrackBtn.disabled = !selectedTrack || !selection || selection.startIndex === selection.endIndex;
  resetTrackBtn.disabled = !selectedTrack || !selectedTrack.originalSegments;

  if (selectedTrack && selection) {
    const pointCount = flattenTrack(selectedTrack).length;
    startInput.max = String(Math.max(0, pointCount - 1));
    endInput.max = String(Math.max(0, pointCount - 1));
    startInput.value = String(selection.startIndex);
    endInput.value = String(selection.endIndex);
    const selectedCount = Math.abs(selection.endIndex - selection.startIndex) + 1;
    selectionHint.textContent = `${selectedCount.toLocaleString()} of ${pointCount.toLocaleString()} points selected${selection.startIndex > selection.endIndex ? ' · route piece will be reversed' : ''}.`;
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
    meta.textContent = `${piece.startIndex.toLocaleString()}–${piece.endIndex.toLocaleString()} · ${count.toLocaleString()} pts${piece.reversed ? ' · reversed' : ''}`;
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
