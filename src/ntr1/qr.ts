import qrcode from 'qrcode-generator';
import type { Ntr1ErrorCorrection, Ntr1QrResult } from './types';

export interface Ntr1QrSymbol extends Ntr1QrResult {
  isDark(row: number, column: number): boolean;
}

function versionFromModules(modules: number): number {
  const version = (modules - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 40) throw new Error('Unexpected QR module dimensions.');
  return version;
}

export function createTextQr(
  text: string,
  errorCorrection: Ntr1ErrorCorrection,
  mode: 'Alphanumeric' | 'Byte' = 'Byte',
): Ntr1QrSymbol {
  const qr = qrcode(0, errorCorrection);
  qr.addData(text, mode);
  try {
    qr.make();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/overflow/i.test(message)) throw new Error('QR payload does not fit one QR code at this error-correction level.');
    throw error;
  }
  const modules = qr.getModuleCount();
  return {
    version: versionFromModules(modules),
    modules,
    errorCorrection,
    payloadChars: text.length,
    isDark: (row, column) => qr.isDark(row, column),
  };
}

export function createNtr1Qr(payload: string, errorCorrection: Ntr1ErrorCorrection): Ntr1QrSymbol {
  if (!/^NTR1:/.test(payload)) throw new Error('QR payload is not NTR1 text.');
  try {
    return createTextQr(payload, errorCorrection, 'Alphanumeric');
  } catch (error) {
    if (error instanceof Error && /QR payload does not fit/.test(error.message)) {
      throw new Error('NTR1 payload does not fit one QR code at this error-correction level.');
    }
    throw error;
  }
}

export function payloadFitsQr(payload: string, errorCorrection: Ntr1ErrorCorrection): boolean {
  try {
    createNtr1Qr(payload, errorCorrection);
    return true;
  } catch (error) {
    if (error instanceof Error && /does not fit one QR/i.test(error.message)) return false;
    throw error;
  }
}

export function paintQrToCanvas(symbol: Ntr1QrSymbol, canvas: HTMLCanvasElement, modulePixels = 5, quietZoneModules = 4): void {
  const size = (symbol.modules + quietZoneModules * 2) * modulePixels;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#000';
  for (let row = 0; row < symbol.modules; row += 1) {
    for (let column = 0; column < symbol.modules; column += 1) {
      if (symbol.isDark(row, column)) {
        context.fillRect((column + quietZoneModules) * modulePixels, (row + quietZoneModules) * modulePixels, modulePixels, modulePixels);
      }
    }
  }
}

export async function qrPngBlob(symbol: Ntr1QrSymbol, modulePixels = 10): Promise<Blob> {
  const canvas = document.createElement('canvas');
  paintQrToCanvas(symbol, canvas, modulePixels, 4);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create QR PNG.')), 'image/png');
  });
}

export function qrSvg(symbol: Ntr1QrSymbol, modulePixels = 8, quietZoneModules = 4): string {
  const total = symbol.modules + quietZoneModules * 2;
  const size = total * modulePixels;
  const path: string[] = [];
  for (let row = 0; row < symbol.modules; row += 1) {
    for (let column = 0; column < symbol.modules; column += 1) {
      if (symbol.isDark(row, column)) path.push(`M${column + quietZoneModules} ${row + quietZoneModules}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path.join('')}" fill="black"/></svg>`;
}
