import type { GpxPoint } from '../gpx/types';
import { base45EncodedLength, decodeBase45, encodeBase45 } from './base45';
import { crc32, crc32Hex } from './crc32';
import { readUleb128, writeUleb128, zigZagDecode, zigZagEncode } from './leb128';
import { measuredMaxDeviationMeters, quantizeE5AndDedupe, simplifyPoints } from './simplify';
import type { Ntr1DecodedRoute, Ntr1EncodeOptions, Ntr1EncodingResult } from './types';

const PRECISION = 5 as const;
const SCALE = 100000;

function validatePoint(point: GpxPoint): void {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) {
    throw new Error('Invalid latitude/longitude.');
  }
}

function encodeBinary(points: GpxPoint[]): Uint8Array {
  if (!points.length) throw new Error('No route points to encode.');
  const integers = points.map((point) => {
    validatePoint(point);
    return [Math.round(point.lat * SCALE), Math.round(point.lon * SCALE)] as const;
  });
  const bytes: number[] = [];
  const first = new ArrayBuffer(8);
  const view = new DataView(first);
  view.setInt32(0, integers[0][0], true);
  view.setInt32(4, integers[0][1], true);
  bytes.push(...new Uint8Array(first));
  for (let index = 1; index < integers.length; index += 1) {
    writeUleb128(bytes, zigZagEncode(integers[index][0] - integers[index - 1][0]));
    writeUleb128(bytes, zigZagEncode(integers[index][1] - integers[index - 1][1]));
  }
  return new Uint8Array(bytes);
}

export function encodeNtr1(points: GpxPoint[], options: Ntr1EncodeOptions = {}): Ntr1EncodingResult {
  const precision = options.precision ?? PRECISION;
  if (precision !== PRECISION) throw new Error('NTR1 v1 supports E5 precision only.');
  if (points.length < 2) throw new Error('NTR1 requires at least two route points.');
  points.forEach(validatePoint);
  const tolerance = options.simplificationToleranceMeters ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Simplification tolerance must be 0 or greater.');
  const simplified = simplifyPoints(points, tolerance);
  const quantized = quantizeE5AndDedupe(simplified);
  if (quantized.length < 2) throw new Error('The route collapses to fewer than two distinct E5 coordinates.');
  const binary = encodeBinary(quantized);
  const checksum = crc32Hex(binary);
  const body = encodeBase45(binary);
  const payload = `NTR1:E5:N${quantized.length}:B${binary.length}:C${checksum}:${body}X`;
  return {
    payload,
    originalPointCount: points.length,
    encodedPointCount: quantized.length,
    binaryBytes: binary.length,
    payloadChars: payload.length,
    simplificationToleranceMeters: tolerance,
    measuredMaxDeviationMeters: measuredMaxDeviationMeters(points, quantized),
    precision,
    crc32: checksum,
    points: quantized,
  };
}

function splitHeader(payload: string): { fields: string[]; rest: string } {
  const separators: number[] = [];
  for (let index = 0; index < payload.length && separators.length < 5; index += 1) {
    if (payload[index] === ':') separators.push(index);
  }
  if (separators.length !== 5) throw new Error('Malformed NTR1 header.');
  const fields = [
    payload.slice(0, separators[0]),
    payload.slice(separators[0] + 1, separators[1]),
    payload.slice(separators[1] + 1, separators[2]),
    payload.slice(separators[2] + 1, separators[3]),
    payload.slice(separators[3] + 1, separators[4]),
  ];
  return { fields, rest: payload.slice(separators[4] + 1) };
}

export function decodeNtr1(input: string): Ntr1DecodedRoute {
  const payload = String(input).replace(/[\r\n]+$/, '');
  const { fields, rest } = splitHeader(payload);
  if (fields[0] !== 'NTR1') throw new Error('Not an NTR1 payload.');
  if (fields[1] !== 'E5') throw new Error('Unsupported NTR1 precision/version. NTR1 v1 requires E5.');
  if (!/^N[1-9]\d*$/.test(fields[2]) || !/^B[1-9]\d*$/.test(fields[3]) || !/^C[0-9A-F]{8}$/.test(fields[4])) {
    throw new Error('Malformed NTR1 header.');
  }
  const pointCount = Number(fields[2].slice(1));
  const binaryBytes = Number(fields[3].slice(1));
  const expectedCrc = fields[4].slice(1);
  if (!Number.isSafeInteger(pointCount) || pointCount < 1 || !Number.isSafeInteger(binaryBytes) || binaryBytes < 8) {
    throw new Error('Invalid NTR1 header values.');
  }
  const encodedLength = base45EncodedLength(binaryBytes);
  if (rest.length < encodedLength + 1) throw new Error('Truncated NTR1 payload.');
  const body = rest.slice(0, encodedLength);
  if (rest[encodedLength] !== 'X') throw new Error('Missing NTR1 sentinel X.');
  if (rest.length !== encodedLength + 1) throw new Error('Unexpected characters after NTR1 sentinel.');
  const binary = decodeBase45(body);
  if (binary.length !== binaryBytes) throw new Error('Binary length mismatch.');
  const actualCrc = crc32Hex(binary);
  if (actualCrc !== expectedCrc) throw new Error(`CRC mismatch: expected ${expectedCrc}, got ${actualCrc}.`);
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  let lat = view.getInt32(0, true);
  let lon = view.getInt32(4, true);
  let position = 8;
  const points: GpxPoint[] = [{ lat: lat / SCALE, lon: lon / SCALE }];
  for (let index = 1; index < pointCount; index += 1) {
    const latDelta = readUleb128(binary, position);
    position = latDelta.next;
    const lonDelta = readUleb128(binary, position);
    position = lonDelta.next;
    lat += zigZagDecode(latDelta.value);
    lon += zigZagDecode(lonDelta.value);
    const point = { lat: lat / SCALE, lon: lon / SCALE };
    validatePoint(point);
    points.push(point);
  }
  if (points.length !== pointCount) throw new Error('Incorrect point count.');
  if (position !== binary.length) throw new Error('Unexplained trailing bytes in NTR1 body.');
  if ((crc32(binary) >>> 0).toString(16).toUpperCase().padStart(8, '0') !== expectedCrc) throw new Error('CRC verification failed.');
  return { payload, precision: PRECISION, pointCount, binaryBytes, crc32: actualCrc, points };
}
