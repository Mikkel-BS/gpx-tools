import 'ol/ol.css';
import './styles.css';
import { buildComposite, createPiece, detectDiscontinuities, flattenTrack, getPiecePoints } from './editor/model';
import { parseGpx } from './gpx/parser';
import { getTrackStats } from './gpx/stats';
import { pointsToCoordinateOnlyGpx, toCoordinateOnlyGpx } from './gpx/serialize';
import { downloadText } from './export/download';
import { MapController } from './map/mapController';
import { store } from './state/store';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <header><div class="eyebrow">LOCAL · CLIENT-SIDE</div><h1>GPX & Map Tool</h1><p>Edit and compose GPX tracks without uploading them.</p></header>
      <section><h2>Tracks</h2><label class="import"><input id="fileInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" multiple><span>Import GPX files</span></label><p class="hint">Up to four files.</p><div id="trackList"></div></section>
      <section id="selectionSection"><h2>Select subsection</h2><div class="range-grid"><label>Start point<input id="startIndex" type="number" min="0" step="1" value="0"></label><label>End point<input id="endIndex" type="number" min="0" step="1" value="0"></label></div><button id="addPiece" class="primary" disabled>Add section to route</button><p id="selectionHint" class="hint">Select a track first.</p></section>
      <section><div class="section-title"><h2>Combined route</h2><div class="history"><button id="undo" title="Undo" disabled>↶</button><button id="redo" title="Redo" disabled>↷</button></div></div><div id="pieceList"></div><div id="discontinuities" class="warnings"></div><button id="clearPieces" class="secondary" disabled>Clear route</button></section>
      <section><h2>Export</h2><button id="cleanExport" class="secondary" disabled>Selected track · coordinate-only</button><button id="routeExport" class="primary" disabled>Combined route · coordinate-only</button><p class="hint">Exports valid GPX with latitude/longitude only; source files remain unchanged.</p></section>
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
const selectionHint = document.querySelector<HTMLParagraphElement>('#selectionHint')!;
const cleanExportBtn = document.querySelector<HTMLButtonElement>('#cleanExport')!;
const routeExportBtn = document.querySelector<HTMLButtonElement>('#routeExport')!;
const clearPiecesBtn = document.querySelector<HTMLButtonElement>('#clearPieces')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo')!;
const discontinuitiesEl = document.querySelector<HTMLDivElement>('#discontinuities')!;
const status = document.querySelector<HTMLDivElement>('#status')!;

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

addPieceBtn.addEventListener('click', () => {
  const state = store.get();
  const track = state.tracks.find((item) => item.id === state.selectedTrackId);
  if (!track) return;
  try {
    store.addPiece(createPiece(track, Number(startInput.value), Number(endInput.value)));
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
  const points = buildComposite(state.pieces, state.tracks);
  if (points.length < 2) return;
  downloadText('combined-route.gpx', pointsToCoordinateOnlyGpx(points));
});

clearPiecesBtn.addEventListener('click', () => store.clearPieces());
undoBtn.addEventListener('click', () => store.undo());
redoBtn.addEventListener('click', () => store.redo());

store.subscribe((state) => {
  const selectedTrack = state.tracks.find((track) => track.id === state.selectedTrackId);
  const composite = buildComposite(state.pieces, state.tracks);
  map.setTracks(state.tracks, state.selectedTrackId);
  map.setComposite(composite);

  cleanExportBtn.disabled = !selectedTrack;
  routeExportBtn.disabled = composite.length < 2;
  clearPiecesBtn.disabled = state.pieces.length === 0;
  undoBtn.disabled = !store.canUndo();
  redoBtn.disabled = !store.canRedo();
  addPieceBtn.disabled = !selectedTrack;

  if (selectedTrack) {
    const pointCount = flattenTrack(selectedTrack).length;
    startInput.max = String(Math.max(0, pointCount - 1));
    endInput.max = String(Math.max(0, pointCount - 1));
    if (Number(endInput.value) <= 0 || Number(endInput.value) >= pointCount) endInput.value = String(Math.max(0, pointCount - 1));
    selectionHint.textContent = `${pointCount.toLocaleString()} points · indexes 0–${Math.max(0, pointCount - 1).toLocaleString()}`;
  } else {
    selectionHint.textContent = 'Select a track first.';
  }

  status.textContent = state.tracks.length
    ? `${state.tracks.length} track${state.tracks.length === 1 ? '' : 's'} · ${state.pieces.length} route piece${state.pieces.length === 1 ? '' : 's'}`
    : 'No tracks loaded';

  list.replaceChildren(...state.tracks.map((track) => {
    const stats = getTrackStats(track);
    const card = document.createElement('div');
    card.className = `track-card ${track.id === state.selectedTrackId ? 'selected' : ''}`;
    const main = document.createElement('button');
    main.className = 'track-main';
    const strong = document.createElement('strong');
    strong.textContent = track.fileName;
    const meta = document.createElement('span');
    meta.textContent = `${stats.points.toLocaleString()} pts · ${(stats.distanceMeters / 1000).toFixed(1)} km · ${stats.segments} seg`;
    main.append(strong, meta);
    main.onclick = () => store.set({ selectedTrackId: track.id });
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
    card.className = 'piece-card';
    const info = document.createElement('div');
    info.className = 'piece-info';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${track?.fileName ?? 'Missing track'}`;
    const meta = document.createElement('span');
    meta.textContent = `${piece.startIndex.toLocaleString()}–${piece.endIndex.toLocaleString()} · ${count.toLocaleString()} pts${piece.reversed ? ' · reversed' : ''}`;
    info.append(title, meta);
    const controls = document.createElement('div');
    controls.className = 'piece-controls';
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
