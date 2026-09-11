import type { GpxPoint } from '../gpx/types';
import { encodeNtr1 } from './codec';
import { createNtr1Qr } from './qr';
import type { Ntr1EncodingResult, Ntr1ErrorCorrection, Ntr1QrResult } from './types';

export interface Ntr1FitResult {
  encoding: Ntr1EncodingResult;
  qr: Ntr1QrResult;
}

export function encodeAtTolerance(points: GpxPoint[], toleranceMeters: number, errorCorrection: Ntr1ErrorCorrection): Ntr1FitResult {
  const encoding = encodeNtr1(points, { simplificationToleranceMeters: toleranceMeters, precision: 5 });
  const symbol = createNtr1Qr(encoding.payload, errorCorrection);
  return { encoding, qr: symbol };
}

export async function autoFitNtr1(
  points: GpxPoint[],
  errorCorrection: Ntr1ErrorCorrection,
  maxToleranceMeters = 1024,
): Promise<Ntr1FitResult> {
  try {
    return encodeAtTolerance(points, 0, errorCorrection);
  } catch (error) {
    if (!(error instanceof Error) || !/does not fit one QR/i.test(error.message)) throw error;
  }

  let low = 0;
  let high = 0.25;
  let fit: Ntr1FitResult | undefined;
  while (high <= maxToleranceMeters) {
    try {
      fit = encodeAtTolerance(points, high, errorCorrection);
      break;
    } catch (error) {
      if (!(error instanceof Error) || !/does not fit one QR/i.test(error.message)) throw error;
      low = high;
      high *= 2;
      await Promise.resolve();
    }
  }
  if (!fit) throw new Error(`This route cannot be reduced to one QR even at ${maxToleranceMeters} m simplification. Split or shorten the route.`);

  for (let iteration = 0; iteration < 14; iteration += 1) {
    const midpoint = (low + high) / 2;
    try {
      const candidate = encodeAtTolerance(points, midpoint, errorCorrection);
      fit = candidate;
      high = midpoint;
    } catch (error) {
      if (!(error instanceof Error) || !/does not fit one QR/i.test(error.message)) throw error;
      low = midpoint;
    }
    if (iteration % 3 === 2) await Promise.resolve();
  }
  return fit;
}
