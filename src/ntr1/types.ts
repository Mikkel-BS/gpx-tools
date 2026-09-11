import type { GpxPoint } from '../gpx/types';

export type Ntr1ErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export interface Ntr1EncodeOptions {
  simplificationToleranceMeters?: number;
  precision?: 5;
}

export interface Ntr1EncodingResult {
  payload: string;
  originalPointCount: number;
  encodedPointCount: number;
  binaryBytes: number;
  payloadChars: number;
  simplificationToleranceMeters: number;
  measuredMaxDeviationMeters: number;
  precision: 5;
  crc32: string;
  points: GpxPoint[];
}

export interface Ntr1DecodedRoute {
  payload: string;
  precision: 5;
  pointCount: number;
  binaryBytes: number;
  crc32: string;
  points: GpxPoint[];
}

export interface Ntr1QrResult {
  version: number;
  modules: number;
  errorCorrection: Ntr1ErrorCorrection;
  payloadChars: number;
}

export interface Ntr1Source {
  id: 'working-track' | 'combined-route';
  label: string;
  points: GpxPoint[];
  segments: number;
  distanceMeters: number;
  fileStem: string;
}
