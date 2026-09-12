import { describe, expect, it } from 'vitest';
import type { GpxPoint, GpxTrack } from '../src/gpx/types';
import type { RoutePiece } from '../src/editor/model';
import { decodeBase45, encodeBase45 } from '../src/ntr1/base45';
import { autoFitNtr1 } from '../src/ntr1/capacity';
import { decodeNtr1, encodeNtr1 } from '../src/ntr1/codec';
import { crc32Hex } from '../src/ntr1/crc32';
import { readUleb128, writeUleb128, zigZagDecode, zigZagEncode } from '../src/ntr1/leb128';
import { createNtr1Qr } from '../src/ntr1/qr';
import { measuredMaxDeviationMeters, quantizeE5AndDedupe, simplifyIndices } from '../src/ntr1/simplify';
import { sourceFromCombinedRoute, sourceFromWorkingTrack } from '../src/ntr1/source';

const canonicalPoints: GpxPoint[] = [
  { lat: 60, lon: 10 },
  { lat: 60.00001, lon: 10.00002 },
  { lat: 59.99999, lon: 10.00003 },
];
const CANONICAL = 'NTR1:E5:N3:B12:C85EFEA78:EBGVMBP58F+1LB05H0X';

function track(id: string, segments: GpxPoint[][]): GpxTrack {
  const copied = segments.map((points) => ({ points: points.map((point) => ({ ...point })) }));
  return {
    id,
    fileName: `${id}.gpx`,
    originalXml: '<gpx/>',
    originalSegments: copied.map((segment) => ({ points: segment.points.map((point) => ({ ...point })) })),
    segments: copied,
    importedAt: 0,
  };
}

function piece(id: string, trackId: string, startIndex: number, endIndex: number, reversed = false): RoutePiece {
  return {
    id,
    trackId,
    segmentIndex: 0,
    startPointIndex: startIndex,
    endPointIndex: endIndex,
    startIndex,
    endIndex,
    reversed,
  };
}

describe('NTR1 primitives', () => {
  it('round-trips ZigZag positive and negative boundaries', () => {
    for (const value of [0, 1, -1, 2, -2, 127, -127, 1_000_000, -1_000_000, 2_147_483_647, -2_147_483_648]) {
      expect(zigZagDecode(zigZagEncode(value))).toBe(value);
    }
  });

  it('round-trips unsigned LEB128', () => {
    for (const value of [0, 1, 127, 128, 255, 16_384, 4_294_967_295]) {
      const bytes: number[] = [];
      writeUleb128(bytes, value);
      const decoded = readUleb128(new Uint8Array(bytes), 0);
      expect(decoded.value).toBe(value);
      expect(decoded.next).toBe(bytes.length);
    }
  });

  it('round-trips Base45', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255, 17]);
    expect(decodeBase45(encodeBase45(bytes))).toEqual(bytes);
  });

  it('matches the standard CRC32 vector', () => {
    expect(crc32Hex(new TextEncoder().encode('123456789'))).toBe('CBF43926');
  });
});

describe('NTR1 codec', () => {
  it('matches the canonical small fixture from the reference implementation', () => {
    expect(encodeNtr1(canonicalPoints).payload).toBe(CANONICAL);
    expect(decodeNtr1(CANONICAL).points).toEqual(canonicalPoints);
  });

  it('round-trips identical E5 coordinates', () => {
    const input = [
      { lat: 61.123456, lon: 9.234567 },
      { lat: 61.123491, lon: 9.234601 },
      { lat: 61.123532, lon: 9.234651 },
    ];
    const encoded = encodeNtr1(input);
    expect(decodeNtr1(encoded.payload).points).toEqual(encoded.points);
  });

  it('rejects wrong CRC', () => {
    expect(() => decodeNtr1(CANONICAL.replace('C85EFEA78', 'C00000000'))).toThrow(/CRC mismatch/);
  });

  it('rejects wrong byte count', () => {
    expect(() => decodeNtr1(CANONICAL.replace('B12', 'B13'))).toThrow();
  });

  it('rejects wrong point count', () => {
    expect(() => decodeNtr1(CANONICAL.replace('N3', 'N4'))).toThrow(/Truncated LEB128|point count/i);
  });

  it('rejects truncation', () => {
    expect(() => decodeNtr1(CANONICAL.slice(0, -4))).toThrow(/Truncated|sentinel/i);
  });

  it('rejects bad Base45', () => {
    const broken = CANONICAL.replace('EBG', 'E@G');
    expect(() => decodeNtr1(broken)).toThrow(/Base45/);
  });

  it('rejects a missing sentinel', () => {
    expect(() => decodeNtr1(CANONICAL.slice(0, -1))).toThrow(/sentinel|Truncated/i);
  });

  it('preserves legal spaces inside the exact-length Base45 body', () => {
    const bytes = new Uint8Array([0, 36]);
    const encoded = encodeBase45(bytes);
    expect(encoded).toContain(' ');
    expect(decodeBase45(encoded)).toEqual(bytes);
  });
});

describe('NTR1 geometry', () => {
  it('simplifies a straight track aggressively', () => {
    const points = Array.from({ length: 101 }, (_, index) => ({ lat: 60 + index * 0.00001, lon: 10 }));
    expect(simplifyIndices(points, 1).length).toBe(2);
  });

  it('retains a tight turn', () => {
    const points = [
      { lat: 60, lon: 10 },
      { lat: 60, lon: 10.001 },
      { lat: 60.001, lon: 10.001 },
    ];
    expect(simplifyIndices(points, 10)).toEqual([0, 1, 2]);
  });

  it('measures deviation in metres', () => {
    const source = [{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0.001 }, { lat: 0, lon: 0.002 }];
    const encoded = [source[0], source[2]];
    expect(measuredMaxDeviationMeters(source, encoded)).toBeGreaterThan(100);
  });

  it('includes E5 quantization deviation', () => {
    const source = [{ lat: 60.0000049, lon: 10.0000049 }, { lat: 60.0001049, lon: 10.0001049 }];
    const quantized = quantizeE5AndDedupe(source);
    const error = measuredMaxDeviationMeters(source, quantized);
    expect(error).toBeGreaterThan(0);
    expect(error).toBeLessThan(1);
  });

  it('unwraps longitude sensibly near the antimeridian', () => {
    const points = [
      { lat: 10, lon: 179.999 },
      { lat: 10.0001, lon: -179.9999 },
      { lat: 10.0002, lon: -179.999 },
    ];
    expect(simplifyIndices(points, 50).length).toBe(2);
  });

  it('removes consecutive duplicate post-quantization coordinates', () => {
    const result = quantizeE5AndDedupe([
      { lat: 1.000001, lon: 2.000001 },
      { lat: 1.000002, lon: 2.000002 },
      { lat: 1.00002, lon: 2.00002 },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('NTR1 segment safety', () => {
  const a = { lat: 60, lon: 10 };
  const b = { lat: 60.001, lon: 10.001 };
  const c = { lat: 60.002, lon: 10.002 };
  const d = { lat: 60.003, lon: 10.003 };

  it('encodes a single working segment', () => {
    expect(sourceFromWorkingTrack(track('one', [[a, b, c]])).points).toHaveLength(3);
  });

  it('never silently bridges a multi-segment working track', () => {
    expect(() => sourceFromWorkingTrack(track('two', [[a, b], [c, d]]))).toThrow(/one continuous route|segments or gaps/i);
  });

  it('rejects disconnected combined pieces', () => {
    const first = track('first', [[a, b]]);
    const second = track('second', [[c, d]]);
    expect(() => sourceFromCombinedRoute([piece('p1', 'first', 0, 1), piece('p2', 'second', 0, 1)], [first, second])).toThrow(/one continuous route|segments or gaps/i);
  });

  it('accepts combined pieces with a shared endpoint', () => {
    const first = track('first', [[a, b]]);
    const second = track('second', [[b, c]]);
    expect(sourceFromCombinedRoute([piece('p1', 'first', 0, 1), piece('p2', 'second', 0, 1)], [first, second]).points).toEqual([a, b, c]);
  });

  it('accepts genuinely adjacent slices of the same segment', () => {
    const source = track('same', [[a, b, c, d]]);
    const combined = sourceFromCombinedRoute([piece('p1', 'same', 0, 1), piece('p2', 'same', 2, 3)], [source]);
    expect(combined.points).toEqual([a, b, c, d]);
  });
});

describe('NTR1 QR fitting', () => {
  it('produces a valid QR with expected version constraints', () => {
    const symbol = createNtr1Qr(CANICAL, 'Q');
    expect(symbol.version).toBeGreaterThanOrEqual(1);
    expect(symbol.version).toBeLessThanOrEqual(40);
    expect(symbol.modules).toBe(17 + 4 * symbol.version);
  });

  it('detects QR overflow', () => {
    expect(() => createNtr1Qr(`NTR1:${'A'.repeat(9000)}`, 'H')).toThrow(/does not fit/i);
  });

  it('auto-fit finds a viable tolerance using the real QR encoder', async () => {
    const points = Array.from({ length: 1200 }, (_, index) => ({
      lat: 60 + index * 0.00001,
      lon: 10 + Math.sin(index / 25) * 0.0004,
    }));
    const result = await autoFitNtr1(points, 'Q');
    const symbol = createNtr1Qr(result.encoding.payload, 'Q');
    expect(symbol.version).toBeLessThanOrEqual(40);
    expect(result.encoding.encodedPointCount).toBeLessThan(points.length);
  });
});
