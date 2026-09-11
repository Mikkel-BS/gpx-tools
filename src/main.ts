import 'ol/ol.css';
import './styles.css';
import { parseGpx } from './gpx/parser';
import { getTrackStats } from './gpx/stats';
import { toCoordinateOnlyGpx } from './gpx/serialize';
import { downloadText } from './export/download';
import { MapController } from './map/mapController';
import { store } from './state/store';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="shell">
    <aside class="sidebar">
      <header><div class="eyebrow">LOCAL · CLIENT-SIDE</div><h1>GPX & Map Tool</h1><p>Edit and compose GPX tracks without uploading them.</p></header>
      <section><h2>Tracks</h2><label class="import"><input id="fileInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" multiple><span>Import GPX files</span></label><p class="hint">Up to four files.</p><div id="trackList"></div></section>
      <section><h2>Export</h2><button id="cleanExport" disabled>Download coordinate-only GPX</button><p class="hint">Keeps GPX structure plus latitude/longitude only.</p></section>
      <section class="future"><h2>Next modules</h2><p>Trim · select subsections · combine · reorder · reverse · discontinuity checks · undo/redo · configurable map layers.</p></section>
    </aside>
    <section class="map-panel"><div id="map"></div><div id="status" class="status">No tracks loaded</div></section>
  </main>`;

const map = new MapController(document.querySelector<HTMLElement>('#map')!);
const input = document.querySelector<HTMLInputElement>('#fileInput')!;
const list = document.querySelector<HTMLDivElement>('#trackList')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#cleanExport')!;
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

exportBtn.addEventListener('click', () => {
  const state = store.get();
  const track = state.tracks.find((t) => t.id === state.selectedTrackId);
  if (!track) return;
  const stem = track.fileName.replace(/\.gpx$/i, '');
  downloadText(`${stem}-coordinates-only.gpx`, toCoordinateOnlyGpx(track));
});

store.subscribe((state) => {
  map.setTracks(state.tracks, state.selectedTrackId);
  exportBtn.disabled = !state.selectedTrackId;
  status.textContent = state.tracks.length ? `${state.tracks.length} track${state.tracks.length === 1 ? '' : 's'} loaded` : 'No tracks loaded';
  list.replaceChildren(...state.tracks.map((track) => {
    const stats = getTrackStats(track);
    const card = document.createElement('div');
    card.className = `track-card ${track.id === state.selectedTrackId ? 'selected' : ''}`;
    card.innerHTML = `<button class="track-main"><strong>${track.fileName}</strong><span>${stats.points.toLocaleString()} pts · ${(stats.distanceMeters / 1000).toFixed(1)} km · ${stats.segments} seg</span></button><button class="remove" aria-label="Remove ${track.fileName}">×</button>`;
    card.querySelector<HTMLButtonElement>('.track-main')!.onclick = () => store.set({ selectedTrackId: track.id });
    card.querySelector<HTMLButtonElement>('.remove')!.onclick = () => store.removeTrack(track.id);
    return card;
  }));
});
