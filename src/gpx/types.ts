export interface GpxPoint {
  lat: number;
  lon: number;
}

export interface GpxSegment {
  points: GpxPoint[];
}

export interface GpxTrack {
  id: string;
  fileName: string;
  originalXml: string;
  segments: GpxSegment[];
  importedAt: number;
}

export interface TrackStats {
  points: number;
  segments: number;
  distanceMeters: number;
}
