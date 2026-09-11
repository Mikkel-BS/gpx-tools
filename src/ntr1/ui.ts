import type { RoutePiece } from '../editor/model';
import { createCoordinateOnlyTrack } from '../gpx/factory';
import { pointsToCoordinateOnlyGpx } from '../gpx/serialize';
import type { GpxPoint, GpxTrack } from '../gpx/types';
import { autoFitNtr1 } from './capacity';
import { decodeNtr1, encodeNtr1 } from './codec';
import { createNtr1Qr, paintQrToCanvas, qrPngBlob, qrSvg, type Ntr1QrSymbol } from './qr';
import { NTR1_RESCUE_DECODER_HTML, NTR1_V1_SPEC, rescueDecoderQrBlob } from './recovery';
import { scanQrImage, scanVideoFrame } from './scanner';
import { routeLengthMeters } from './simplify';
import { NTR1_CONTINUITY_MESSAGE, sourceFromCombinedRoute, sourceFromWorkingTrack } from './source';
import type { Ntr1DecodedRoute, Ntr1EncodingResult, Ntr1ErrorCorrection, Ntr1Source } from './types';

interface Ntr1AppState {
  tracks: GpxTrack[];
  selectedTrackId?: string;
  pieces: RoutePiece[];
}

export interface Ntr1UiIntegration {
  getState(): Ntr1AppState;
  addTrack(track: GpxTrack): void;
  setMapPreview(points?: GpxPoint[]): void;
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textBlob(text: string, type = 'text/plain;charset=utf-8'): Blob {
  return new Blob([text], { type });
}

function safeStem(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'route';
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function setStatus(node: HTMLElement, message: string, warning = false): void {
  node.textContent = message;
  node.className = warning ? 'ntr1-status warning' : 'ntr1-status';
}

function drawSchematic(canvas: HTMLCanvasElement, points?: GpxPoint[]): void {
  const width = 520;
  const height = 240;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#fbfaf7';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#d9d7cf';
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
  if (!points || points.length < 2) {
    context.fillStyle = '#77736a';
    context.font = '13px system-ui';
    context.textAlign = 'center';
    context.fillText('No route decoded', width / 2, height / 2);
    return;
  }
  const unwrappedLon: number[] = [points[0].lon];
  for (let index = 1; index < points.length; index += 1) {
    let lon = points[index].lon;
    const previous = unwrappedLon[index - 1];
    while (lon - previous > 180) lon -= 360;
    while (lon - previous < -180) lon += 360;
    unwrappedLon.push(lon);
  }
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length * Math.PI / 180;
  const xs = unwrappedLon.map((lon) => lon * Math.max(0.1, Math.cos(meanLat)));
  const ys = points.map((point) => point.lat);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const dx = Math.max(1e-9, maxX - minX); const dy = Math.max(1e-9, maxY - minY);
  const padding = 24;
  const scale = Math.min((width - padding * 2) / dx, (height - padding * 2) / dy);
  const offsetX = (width - dx * scale) / 2;
  const offsetY = (height - dy * scale) / 2;
  const project = (index: number): [number, number] => [offsetX + (xs[index] - minX) * scale, height - (offsetY + (ys[index] - minY) * scale)];
  context.beginPath();
  let projected = project(0);
  context.moveTo(projected[0], projected[1]);
  for (let index = 1; index < points.length; index += 1) {
    projected = project(index);
    context.lineTo(projected[0], projected[1]);
  }
  context.strokeStyle = '#222';
  context.lineWidth = 2.5;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.stroke();
  context.fillStyle = '#18794e';
  const start = project(0);
  context.beginPath(); context.arc(start[0], start[1], 4.5, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#b42318';
  const end = project(points.length - 1);
  context.beginPath(); context.arc(end[0], end[1], 4.5, 0, Math.PI * 2); context.fill();
}

export function initNtr1Ui(root: HTMLElement, integration: Ntr1UiIntegration): void {
  root.innerHTML = `
    <h2>QR route</h2>
    <p class="hint ntr1-intro"><strong>Route stored directly in QR.</strong> The QR contains the route coordinates themselves. It does not link to a file or website.</p>
    <div class="button-row"><button type="button" class="secondary" id="ntr1Create">Create route QR</button><button type="button" class="secondary" id="ntr1Decode">Decode route QR</button></div>
  `;

  const dialog = document.createElement('dialog');
  dialog.className = 'ntr1-dialog';
  dialog.innerHTML = `
    <div class="ntr1-dialog-shell">
      <div class="ntr1-dialog-head"><div><div class="eyebrow">NTR1 · SELF-CONTAINED</div><h3 id="ntr1Title">Route stored directly in QR</h3></div><button type="button" class="ntr1-close" aria-label="Close">×</button></div>
      <div class="ntr1-view" data-view="encode">
        <div class="ntr1-columns">
          <div class="ntr1-card">
            <h4>Source</h4>
            <label class="field-label">Route source<select id="ntr1Source"><option value="combined-route">Combined route</option><option value="working-track">Selected working track</option></select></label>
            <div id="ntr1SourceSummary" class="ntr1-summary"></div>
            <h4>Quality</h4>
            <div class="ntr1-quality">
              <label><input type="radio" name="ntr1Quality" value="trail" checked><span><strong>Trail / print</strong><small>Recommended · 3 m simplification · Q error correction</small></span></label>
              <label><input type="radio" name="ntr1Quality" value="maximum"><span><strong>Maximum detail</strong><small>Automatically finds the smallest simplification that fits one QR</small></span></label>
              <label><input type="radio" name="ntr1Quality" value="custom"><span><strong>Custom</strong><small>Choose simplification and error correction</small></span></label>
            </div>
            <details class="ntr1-advanced"><summary>Advanced</summary>
              <div class="ntr1-advanced-grid">
                <label class="field-label">QR error correction<select id="ntr1Ecc"><option>L</option><option>M</option><option selected>Q</option><option>H</option></select></label>
                <label class="field-label" id="ntr1ToleranceWrap">Simplification tolerance (m)<input id="ntr1Tolerance" type="number" min="0" step="0.25" value="3"></label>
              </div>
              <p class="hint">Fewer points are used while keeping the route within approximately the requested tolerance. The measured final deviation also includes E5 quantization.</p>
            </details>
            <button type="button" class="primary" id="ntr1EncodeButton">Create QR</button>
            <div id="ntr1EncodeStatus" class="ntr1-status"></div>
          </div>
          <div class="ntr1-card ntr1-result" id="ntr1EncodeResult" hidden>
            <div class="ntr1-qr-wrap"><canvas id="ntr1QrCanvas" aria-label="NTR1 QR code"></canvas></div>
            <div id="ntr1ResultGrid" class="ntr1-result-grid"></div>
            <div id="ntr1DenseWarning" class="warnings"></div>
            <label class="ntr1-preview-toggle"><input id="ntr1ShowPreview" type="checkbox"> Show simplified route on map</label>
            <div class="ntr1-actions"><button type="button" class="primary" id="ntr1DownloadPng">Download QR PNG</button><button type="button" class="secondary" id="ntr1CopyText">Copy NTR1 text</button><button type="button" class="secondary" id="ntr1DownloadText">Download NTR1 text</button><button type="button" class="secondary" id="ntr1DownloadGpx">Download simplified GPX</button></div>
            <details class="ntr1-advanced"><summary>NTR1 payload / SVG</summary><textarea id="ntr1PayloadOut" readonly rows="4"></textarea><button type="button" class="secondary" id="ntr1DownloadSvg">Download QR SVG</button></details>
          </div>
        </div>
      </div>
      <div class="ntr1-view" data-view="decode" hidden>
        <div class="ntr1-columns">
          <div class="ntr1-card">
            <h4>Decode locally</h4>
            <p class="hint">Camera, image and text decoding stay in this browser. No QR or route data is uploaded.</p>
            <div class="ntr1-decode-methods"><button type="button" class="secondary" id="ntr1Camera">Scan with camera</button><label class="secondary ntr1-file-button">Open QR image<input id="ntr1Image" type="file" accept="image/*"></label></div>
            <div id="ntr1VideoWrap" class="ntr1-video-wrap" hidden><video id="ntr1Video" playsinline muted></video><button type="button" class="secondary" id="ntr1StopCamera">Stop camera</button></div>
            <label class="field-label">Paste NTR1 text<textarea id="ntr1PayloadIn" rows="7" placeholder="NTR1:E5:N…"></textarea></label>
            <button type="button" class="primary" id="ntr1DecodeButton">Decode NTR1</button>
            <div id="ntr1DecodeStatus" class="ntr1-status"></div>
          </div>
          <div class="ntr1-card ntr1-result" id="ntr1DecodeResult" hidden>
            <canvas id="ntr1DecodedPreview" class="ntr1-schematic"></canvas>
            <div id="ntr1DecodeGrid" class="ntr1-result-grid"></div>
            <div class="ntr1-actions"><button type="button" class="primary" id="ntr1AddTrack">Add decoded route to Tracks</button><button type="button" class="secondary" id="ntr1DecodedGpx">Download GPX</button><button type="button" class="secondary" id="ntr1CopyDecoded">Copy NTR1 text</button></div>
          </div>
        </div>
      </div>
      <details class="ntr1-recovery"><summary>Advanced · Recovery</summary><p>NTR1 is openly documented. A route can be recovered without this website.</p><p class="hint">The rescue QR is archival: scan it as text, save the recovered HTML source, then open that file and paste an NTR1 route. Modern browsers may refuse to navigate directly to a top-level data: URL.</p><div class="button-row"><button type="button" class="secondary" id="ntr1DownloadSpec">Download NTR1 v1 specification</button><button type="button" class="secondary" id="ntr1DownloadRescue">Download rescue-decoder QR</button></div><button type="button" class="secondary" id="ntr1DownloadRescueHtml">Download rescue decoder HTML</button></details>
    </div>`;
  document.body.appendChild(dialog);

  const get = <T extends Element>(selector: string) => dialog.querySelector<T>(selector)!;
  const createButton = root.querySelector<HTMLButtonElement>('#ntr1Create')!;
  const decodeOpenButton = root.querySelector<HTMLButtonElement>('#ntr1Decode')!;
  const title = get<HTMLElement>('#ntr1Title');
  const sourceSelect = get<HTMLSelectElement>('#ntr1Source');
  const sourceSummary = get<HTMLElement>('#ntr1SourceSummary');
  const eccSelect = get<HTMLSelectElement>('#ntr1Ecc');
  const toleranceInput = get<HTMLInputElement>('#ntr1Tolerance');
  const toleranceWrap = get<HTMLElement>('#ntr1ToleranceWrap');
  const encodeButton = get<HTMLButtonElement>('#ntr1EncodeButton');
  const encodeStatus = get<HTMLElement>('#ntr1EncodeStatus');
  const encodeResult = get<HTMLElement>('#ntr1EncodeResult');
  const resultGrid = get<HTMLElement>('#ntr1ResultGrid');
  const denseWarning = get<HTMLElement>('#ntr1DenseWarning');
  const qrCanvas = get<HTMLCanvasElement>('#ntr1QrCanvas');
  const payloadOut = get<HTMLTextAreaElement>('#ntr1PayloadOut');
  const showPreview = get<HTMLInputElement>('#ntr1ShowPreview');
  const payloadIn = get<HTMLTextAreaElement>('#ntr1PayloadIn');
  const decodeStatus = get<HTMLElement>('#ntr1DecodeStatus');
  const decodeResult = get<HTMLElement>('#ntr1DecodeResult');
  const decodeGrid = get<HTMLElement>('#ntr1DecodeGrid');
  const decodedPreview = get<HTMLCanvasElement>('#ntr1DecodedPreview');
  const imageInput = get<HTMLInputElement>('#ntr1Image');
  const videoWrap = get<HTMLElement>('#ntr1VideoWrap');
  const video = get<HTMLVideoElement>('#ntr1Video');

  let currentSource: Ntr1Source | undefined;
  let encoding: Ntr1EncodingResult | undefined;
  let symbol: Ntr1QrSymbol | undefined;
  let decoded: Ntr1DecodedRoute | undefined;
  let cameraStream: MediaStream | undefined;
  let cameraFrame = 0;
  let scanning = false;
  let lastScanAt = 0;

  const activeQuality = () => get<HTMLInputElement>('input[name="ntr1Quality"]:checked').value;

  function resolveSource(): Ntr1Source | undefined {
    const state = integration.getState();
    try {
      const source = sourceSelect.value === 'combined-route'
        ? sourceFromCombinedRoute(state.pieces, state.tracks)
        : sourceFromWorkingTrack(state.tracks.find((track) => track.id === state.selectedTrackId) ?? (() => { throw new Error('Select a working track first.'); })());
      sourceSummary.innerHTML = `<strong>${source.label}</strong><span>${formatDistance(source.distanceMeters)} · ${source.points.length.toLocaleString()} points · ${source.segments} segment</span>`;
      sourceSummary.classList.remove('warning');
      encodeButton.disabled = false;
      currentSource = source;
      return source;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sourceSummary.textContent = message;
      sourceSummary.classList.add('warning');
      encodeButton.disabled = true;
      currentSource = undefined;
      return undefined;
    }
  }

  function refreshQuality(): void {
    const quality = activeQuality();
    toleranceWrap.hidden = quality !== 'custom';
    eccSelect.disabled = quality === 'trail';
    if (quality === 'trail') eccSelect.value = 'Q';
  }

  function open(view: 'encode' | 'decode'): void {
    dialog.querySelectorAll<HTMLElement>('.ntr1-view').forEach((element) => { element.hidden = element.dataset.view !== view; });
    title.textContent = view === 'encode' ? 'Route stored directly in QR' : 'Decode route QR';
    if (view === 'encode') {
      const state = integration.getState();
      sourceSelect.value = state.pieces.length ? 'combined-route' : 'working-track';
      resolveSource();
      refreshQuality();
    }
    dialog.showModal();
  }

  function stopCamera(): void {
    if (cameraFrame) cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = undefined;
    video.srcObject = null;
    videoWrap.hidden = true;
  }

  function close(): void {
    stopCamera();
    showPreview.checked = false;
    integration.setMapPreview(undefined);
    dialog.close();
  }

  async function copyText(text: string, statusNode: HTMLElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(statusNode, 'Copied to clipboard.');
    } catch {
      setStatus(statusNode, 'Clipboard access was blocked. Select and copy the text manually.', true);
    }
  }

  async function encodeRoute(): Promise<void> {
    const source = resolveSource();
    if (!source) return;
    encodeButton.disabled = true;
    encodeResult.hidden = true;
    integration.setMapPreview(undefined);
    showPreview.checked = false;
    setStatus(encodeStatus, 'Simplifying, quantizing and fitting the route…');
    try {
      const quality = activeQuality();
      let ecc: Ntr1ErrorCorrection = eccSelect.value as Ntr1ErrorCorrection;
      if (quality === 'trail') ecc = 'Q';
      let fit;
      if (quality === 'maximum') {
        fit = await autoFitNtr1(source.points, ecc);
        encoding = fit.encoding;
      } else {
        const tolerance = quality === 'trail' ? 3 : Number(toleranceInput.value);
        if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Simplification tolerance must be 0 or greater.');
        encoding = encodeNtr1(source.points, { simplificationToleranceMeters: tolerance, precision: 5 });
      }
      symbol = createNtr1Qr(encoding.payload, ecc);
      paintQrToCanvas(symbol, qrCanvas, 5, 4);
      payloadOut.value = encoding.payload;
      resultGrid.innerHTML = `
        <div><span>Original</span><strong>${encoding.originalPointCount.toLocaleString()} pts</strong></div>
        <div><span>Encoded</span><strong>${encoding.encodedPointCount.toLocaleString()} pts</strong></div>
        <div><span>Requested</span><strong>${encoding.simplificationToleranceMeters.toFixed(encoding.simplificationToleranceMeters < 10 ? 2 : 1)} m${quality === 'maximum' ? ' auto' : ''}</strong></div>
        <div><span>Max deviation</span><strong>${encoding.measuredMaxDeviationMeters.toFixed(2)} m</strong></div>
        <div><span>NTR1 size</span><strong>${encoding.payloadChars.toLocaleString()} chars · ${encoding.binaryBytes.toLocaleString()} B</strong></div>
        <div><span>QR</span><strong>v${symbol.version} · ${symbol.modules}×${symbol.modules} · ${ecc}</strong></div>`;
      denseWarning.replaceChildren();
      if (symbol.version >= 35) {
        const warning = document.createElement('div');
        warning.textContent = 'Dense QR code. It is valid, but should be printed relatively large and tested with several phones before permanent use.';
        denseWarning.appendChild(warning);
      }
      encodeResult.hidden = false;
      setStatus(encodeStatus, `Encoded ${encoding.encodedPointCount.toLocaleString()} route points. CRC32 ${encoding.crc32}.`);
    } catch (error) {
      encoding = undefined;
      symbol = undefined;
      setStatus(encodeStatus, error instanceof Error ? error.message : String(error), true);
    } finally {
      encodeButton.disabled = !currentSource;
    }
  }

  function renderDecoded(route: Ntr1DecodedRoute): void {
    decoded = route;
    const distance = routeLengthMeters(route.points);
    const start = route.points[0];
    const end = route.points.at(-1)!;
    decodeGrid.innerHTML = `
      <div><span>Integrity</span><strong>CRC verified</strong></div>
      <div><span>Points</span><strong>${route.pointCount.toLocaleString()}</strong></div>
      <div><span>Distance</span><strong>${formatDistance(distance)}</strong></div>
      <div><span>Precision</span><strong>E${route.precision}</strong></div>
      <div><span>Start</span><strong>${start.lat.toFixed(5)}, ${start.lon.toFixed(5)}</strong></div>
      <div><span>End</span><strong>${end.lat.toFixed(5)}, ${end.lon.toFixed(5)}</strong></div>`;
    drawSchematic(decodedPreview, route.points);
    decodeResult.hidden = false;
    setStatus(decodeStatus, `Decoded ${route.pointCount.toLocaleString()} points; CRC verified.`);
  }

  function decodePayload(value = payloadIn.value): void {
    try {
      stopCamera();
      const route = decodeNtr1(value.trim());
      payloadIn.value = route.payload;
      renderDecoded(route);
    } catch (error) {
      decoded = undefined;
      decodeResult.hidden = true;
      setStatus(decodeStatus, error instanceof Error ? error.message : String(error), true);
    }
  }

  async function cameraTick(time: number): Promise<void> {
    if (!cameraStream) return;
    if (!scanning && time - lastScanAt > 160) {
      lastScanAt = time;
      scanning = true;
      try {
        const value = await scanVideoFrame(video);
        if (value?.startsWith('NTR1:')) {
          payloadIn.value = value;
          decodePayload(value);
          return;
        }
      } catch {
        // Keep scanning; transient frame failures are expected.
      } finally {
        scanning = false;
      }
    }
    cameraFrame = requestAnimationFrame((next) => { void cameraTick(next); });
  }

  async function startCamera(): Promise<void> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser/context.');
      stopCamera();
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = cameraStream;
      await video.play();
      videoWrap.hidden = false;
      setStatus(decodeStatus, 'Point the camera at an NTR1 QR code.');
      cameraFrame = requestAnimationFrame((time) => { void cameraTick(time); });
    } catch (error) {
      setStatus(decodeStatus, error instanceof Error ? error.message : String(error), true);
    }
  }

  createButton.addEventListener('click', () => open('encode'));
  decodeOpenButton.addEventListener('click', () => open('decode'));
  get<HTMLButtonElement>('.ntr1-close').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  sourceSelect.addEventListener('change', () => { resolveSource(); encodeResult.hidden = true; integration.setMapPreview(undefined); });
  dialog.querySelectorAll<HTMLInputElement>('input[name="ntr1Quality"]').forEach((radio) => radio.addEventListener('change', refreshQuality));
  encodeButton.addEventListener('click', () => { void encodeRoute(); });
  showPreview.addEventListener('change', () => integration.setMapPreview(showPreview.checked ? encoding?.points : undefined));
  get<HTMLButtonElement>('#ntr1DownloadPng').addEventListener('click', async () => {
    if (!encoding || !symbol || !currentSource) return;
    downloadBlob(`${safeStem(currentSource.fileStem)}-NTR1-QR-${symbol.errorCorrection}.png`, await qrPngBlob(symbol, 10));
  });
  get<HTMLButtonElement>('#ntr1DownloadSvg').addEventListener('click', () => {
    if (!symbol || !currentSource) return;
    downloadBlob(`${safeStem(currentSource.fileStem)}-NTR1-QR.svg`, textBlob(qrSvg(symbol), 'image/svg+xml;charset=utf-8'));
  });
  get<HTMLButtonElement>('#ntr1CopyText').addEventListener('click', () => { if (encoding) void copyText(encoding.payload, encodeStatus); });
  get<HTMLButtonElement>('#ntr1DownloadText').addEventListener('click', () => {
    if (!encoding || !currentSource) return;
    downloadBlob(`${safeStem(currentSource.fileStem)}.ntr1.txt`, textBlob(`${encoding.payload}\n`, 'text/plain;charset=us-ascii'));
  });
  get<HTMLButtonElement>('#ntr1DownloadGpx').addEventListener('click', () => {
    if (!encoding || !currentSource) return;
    downloadBlob(`${safeStem(currentSource.fileStem)}-NTR1-simplified.gpx`, textBlob(pointsToCoordinateOnlyGpx(encoding.points), 'application/gpx+xml;charset=utf-8'));
  });

  get<HTMLButtonElement>('#ntr1DecodeButton').addEventListener('click', () => decodePayload());
  get<HTMLButtonElement>('#ntr1Camera').addEventListener('click', () => { void startCamera(); });
  get<HTMLButtonElement>('#ntr1StopCamera').addEventListener('click', stopCamera);
  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    try {
      setStatus(decodeStatus, 'Reading QR image locally…');
      const value = await scanQrImage(file);
      payloadIn.value = value;
      decodePayload(value);
    } catch (error) {
      setStatus(decodeStatus, error instanceof Error ? error.message : String(error), true);
    } finally {
      imageInput.value = '';
    }
  });
  get<HTMLButtonElement>('#ntr1AddTrack').addEventListener('click', () => {
    if (!decoded) return;
    try {
      integration.addTrack(createCoordinateOnlyTrack(decoded.points, 'ntr1-route.gpx'));
      setStatus(decodeStatus, 'Decoded route added to Tracks.');
      close();
    } catch (error) {
      setStatus(decodeStatus, error instanceof Error ? error.message : String(error), true);
    }
  });
  get<HTMLButtonElement>('#ntr1DecodedGpx').addEventListener('click', () => {
    if (!decoded) return;
    downloadBlob('ntr1-route.gpx', textBlob(pointsToCoordinateOnlyGpx(decoded.points), 'application/gpx+xml;charset=utf-8'));
  });
  get<HTMLButtonElement>('#ntr1CopyDecoded').addEventListener('click', () => { if (decoded) void copyText(decoded.payload, decodeStatus); });

  get<HTMLButtonElement>('#ntr1DownloadSpec').addEventListener('click', () => downloadBlob('NTR1-v1.txt', textBlob(NTR1_V1_SPEC)));
  get<HTMLButtonElement>('#ntr1DownloadRescueHtml').addEventListener('click', () => downloadBlob('NTR1-rescue-decoder.html', textBlob(NTR1_RESCUE_DECODER_HTML, 'text/html;charset=utf-8')));
  get<HTMLButtonElement>('#ntr1DownloadRescue').addEventListener('click', async () => {
    try {
      downloadBlob('NTR1-rescue-decoder-QR-Q.png', await rescueDecoderQrBlob());
    } catch (error) {
      setStatus(dialog.querySelector<HTMLElement>('.ntr1-recovery')!, error instanceof Error ? error.message : String(error), true);
    }
  });

  // Helpful initial message for the continuity constraint, without weakening it.
  sourceSummary.title = NTR1_CONTINUITY_MESSAGE;
}
