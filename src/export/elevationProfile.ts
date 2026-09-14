import { haversineMeters } from '../editor/model';
import type { GpxSegment } from '../gpx/types';

export interface ElevationProfileSample {
  distanceMeters: number;
  elevationMeters: number;
}

export interface ElevationProfilePath {
  samples: ElevationProfileSample[];
}

export interface ElevationProfile {
  paths: ElevationProfilePath[];
  totalDistanceMeters: number;
  minElevationMeters: number;
  maxElevationMeters: number;
  elevationPointCount: number;
  sourceSegmentCount: number;
}

/**
 * Build an elevation profile without fabricating geometry across GPX segment boundaries.
 * Distance accumulates only along recorded point-to-point geometry. Missing elevation values
 * split the profile path rather than being interpolated.
 */
export function buildElevationProfile(segments: GpxSegment[]): ElevationProfile | undefined {
  const paths: ElevationProfilePath[] = [];
  let cumulativeDistance = 0;
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;
  let elevationPointCount = 0;

  for (const segment of segments) {
    let currentPath: ElevationProfileSample[] = [];
    for (let index = 0; index < segment.points.length; index += 1) {
      const point = segment.points[index];
      if (index > 0) cumulativeDistance += haversineMeters(segment.points[index - 1], point);

      if (Number.isFinite(point.ele)) {
        const elevation = point.ele as number;
        currentPath.push({ distanceMeters: cumulativeDistance, elevationMeters: elevation });
        minElevation = Math.min(minElevation, elevation);
        maxElevation = Math.max(maxElevation, elevation);
        elevationPointCount += 1;
      } else if (currentPath.length) {
        paths.push({ samples: currentPath });
        currentPath = [];
      }
    }
    if (currentPath.length) paths.push({ samples: currentPath });
    // No distance is inserted between this segment and the next one.
  }

  if (!elevationPointCount) return undefined;
  return {
    paths,
    totalDistanceMeters: cumulativeDistance,
    minElevationMeters: minElevation,
    maxElevationMeters: maxElevation,
    elevationPointCount,
    sourceSegmentCount: segments.length,
  };
}

export function profileHorizontalCoverageMeters(widthMm: number, metersPerCm: number): number {
  return widthMm / 10 * metersPerCm;
}

export function profileVerticalCoverageMeters(heightMm: number, metersPerCm: number): number {
  return heightMm / 10 * metersPerCm;
}
