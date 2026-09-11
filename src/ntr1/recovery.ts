import specText from './NTR1-v1.txt?raw';
import rescueDecoderHtml from './rescue-decoder.html?raw';
import { createTextQr, qrPngBlob } from './qr';

export const NTR1_V1_SPEC = specText;
export const NTR1_RESCUE_DECODER_HTML = rescueDecoderHtml;

export function specificationBlob(): Blob {
  return new Blob([NTR1_V1_SPEC], { type: 'text/plain;charset=utf-8' });
}

export function rescueDecoderBlob(): Blob {
  return new Blob([NTR1_RESCUE_DECODER_HTML], { type: 'text/html;charset=utf-8' });
}

export async function rescueDecoderQrBlob(): Promise<Blob> {
  // The reference prototype used the same literal 1.17 kB rescue source in a Q-level QR.
  // It is deterministically regenerated locally so there is no network/service dependency.
  const symbol = createTextQr(NTR1_RESCUE_DECODER_HTML, 'Q', 'Byte');
  return qrPngBlob(symbol, 10);
}
