import jsQR from 'jsqr';

type NativeBarcode = { rawValue?: string };
type NativeDetector = { detect(source: ImageBitmapSource): Promise<NativeBarcode[]> };
type NativeDetectorConstructor = new (options: { formats: string[] }) => NativeDetector;

function nativeDetector(): NativeDetector | undefined {
  const ctor = (globalThis as unknown as { BarcodeDetector?: NativeDetectorConstructor }).BarcodeDetector;
  return ctor ? new ctor({ formats: ['qr_code'] }) : undefined;
}

function selectPayload(values: string[]): string | undefined {
  return values.find((value) => value.startsWith('NTR1:')) ?? values[0];
}

function decodeCanvas(canvas: HTMLCanvasElement): string | undefined {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  return code?.data;
}

async function nativeDetect(source: ImageBitmapSource): Promise<string | undefined> {
  const detector = nativeDetector();
  if (!detector) return undefined;
  try {
    const detected = await detector.detect(source);
    return selectPayload(detected.map((item) => item.rawValue ?? '').filter(Boolean));
  } catch {
    return undefined;
  }
}

export async function scanQrImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const native = await nativeDetect(bitmap);
    if (native) return native;
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const decoded = decodeCanvas(canvas);
    if (!decoded) throw new Error('No QR code found in that image.');
    return decoded;
  } finally {
    bitmap.close();
  }
}

let scanCanvas: HTMLCanvasElement | undefined;

export async function scanVideoFrame(video: HTMLVideoElement): Promise<string | undefined> {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return undefined;
  const native = await nativeDetect(video);
  if (native) return native;
  scanCanvas ??= document.createElement('canvas');
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  scanCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  scanCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = scanCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
  return decodeCanvas(scanCanvas);
}
