export interface GpxPoint {
  lat: number;
  lon: number;
  /** Elevation in meters from GPX <ele>, when present. */
  ele?: number;
}

export interface GpxSegment {
  points: GpxPoint[];
}

export interface GpxTrack {
  id: string;
  fileName: string;
  originalXml: string;
  originalSegments: GpxSegment[];
  segments: GpxSegment[];
  importedAt: number;
}

export interface TrackStats {
  points: number;
  segments: number;
  distanceMeters: number;
}
