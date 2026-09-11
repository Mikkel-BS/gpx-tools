import type { GpxPoint } from '../gpx/types';

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

interface ProjectedPoint { x: number; y: number; index: number }

function unwrapLongitudes(points: GpxPoint[]): number[] {
  if (!points.length) return [];
  const output = [points[0].lon];
  for (let index = 1; index < points.length; index += 1) {
    let lon = points[index].lon;
    const previous = output[index - 1];
    while (lon - previous > 180) lon -= 360;
    while (lon - previous < -180) lon += 360;
    output.push(lon);
  }
  return output;
}

function project(points: GpxPoint[]): ProjectedPoint[] {
  if (!points.length) return [];
  const unwrapped = unwrapLongitudes(points);
  const lat0 = points.reduce((sum, point) => sum + point.lat, 0) / points.length * DEG;
  const lon0 = unwrapped.reduce((sum, lon) => sum + lon, 0) / unwrapped.length;
  const cosLat = Math.max(1e-8, Math.cos(lat0));
  return points.map((point, index) => ({
    x: (unwrapped[index] - lon0) * DEG * EARTH_RADIUS_M * cosLat,
    y: (point.lat - lat0 / DEG) * DEG * EARTH_RADIUS_M,
    index,
  }));
}

function pointSegmentDistanceSq(point: ProjectedPoint, start: ProjectedPoint, end: ProjectedPoint): number {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const vv = vx * vx + vy * vy;
  const t = vv ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv)) : 0;
  const dx = point.x - (start.x + t * vx);
  const dy = point.y - (start.y + t * vy);
  return dx * dx + dy * dy;
}

export function simplifyIndices(points: GpxPoint[], toleranceMeters: number): number[] {
  const count = points.length;
  if (count <= 2 || toleranceMeters <= 0) return Array.from({ length: count }, (_, index) => index);
  const projected = project(points);
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const toleranceSq = toleranceMeters * toleranceMeters;
  const stack: Array<[number, number]> = [[0, count - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let bestIndex = -1;
    let maxDistance = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = pointSegmentDistanceSq(projected[index], projected[start], projected[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        bestIndex = index;
      }
    }
    if (maxDistance > toleranceSq && bestIndex > start) {
      keep[bestIndex] = 1;
      stack.push([start, bestIndex], [bestIndex, end]);
    }
  }
  const indices: number[] = [];
  for (let index = 0; index < count; index += 1) if (keep[index]) indices.push(index);
  return indices;
}

export function simplifyPoints(points: GpxPoint[], toleranceMeters: number): GpxPoint[] {
  return simplifyIndices(points, toleranceMeters).map((index) => ({ ...points[index] }));
}

export function quantizeE5AndDedupe(points: GpxPoint[]): GpxPoint[] {
  const result: GpxPoint[] = [];
  let lastLat: number | undefined;
  let lastLon: number | undefined;
  for (const point of points) {
    const latInt = Math.round(point.lat * 100000);
    const lonInt = Math.round(point.lon * 100000);
    if (latInt === lastLat && lonInt === lastLon) continue;
    result.push({ lat: latInt / 100000, lon: lonInt / 100000 });
    lastLat = latInt;
    lastLon = lonInt;
  }
  return result;
}

export function measuredMaxDeviationMeters(source: GpxPoint[], encoded: GpxPoint[]): number {
  if (!source.length || !encoded.length) return 0;
  if (encoded.length === 1) {
    const projected = project([...source, encoded[0]]);
    const target = projected[projected.length - 1];
    let maximum = 0;
    for (let index = 0; index < source.length; index += 1) {
      maximum = Math.max(maximum, Math.hypot(projected[index].x - target.x, projected[index].y - target.y));
    }
    return maximum;
  }
  const all = [...source, ...encoded];
  const projected = project(all);
  const sourceProjected = projected.slice(0, source.length);
  const encodedProjected = projected.slice(source.length);
  let maximumSq = 0;
  for (const point of sourceProjected) {
    let minimumSq = Number.POSITIVE_INFINITY;
    for (let index = 0; index < encodedProjected.length - 1; index += 1) {
      minimumSq = Math.min(minimumSq, pointSegmentDistanceSq(point, encodedProjected[index], encodedProjected[index + 1]));
    }
    maximumSq = Math.max(maximumSq, minimumSq);
  }
  return Math.sqrt(maximumSq);
}

export function routeLengthMeters(points: GpxPoint[]): number {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const lat1 = a.lat * DEG;
    const lat2 = b.lat * DEG;
    const dLat = (b.lat - a.lat) * DEG;
    let dLonDeg = b.lon - a.lon;
    while (dLonDeg > 180) dLonDeg -= 360;
    while (dLonDeg < -180) dLonDeg += 360;
    const dLon = dLonDeg * DEG;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    distance += 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return distance;
}
