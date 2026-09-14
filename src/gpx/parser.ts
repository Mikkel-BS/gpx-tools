import type { GpxPoint, GpxSegment, GpxTrack } from './types';

const parser = new DOMParser();

function localName(el: Element): string {
  return el.localName || el.nodeName.split(':').pop() || el.nodeName;
}

function childElements(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((child) => localName(child) === name);
}

function cloneSegments(segments: GpxSegment[]): GpxSegment[] {
  return segments.map((segment) => ({ points: segment.points.map((point) => ({ ...point })) }));
}

function pointFromElement(pt: Element): GpxPoint | undefined {
  const lat = Number(pt.getAttribute('lat'));
  const lon = Number(pt.getAttribute('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  const eleElement = childElements(pt, 'ele')[0];
  const ele = eleElement ? Number(eleElement.textContent) : undefined;
  return Number.isFinite(ele) ? { lat, lon, ele } : { lat, lon };
}

export function parseGpx(xml: string, fileName: string): GpxTrack {
  const doc = parser.parseFromString(xml, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid XML/GPX document.');
  const root = doc.documentElement;
  if (!root || localName(root) !== 'gpx') throw new Error('File is not a GPX document.');

  const segments: GpxSegment[] = [];
  const tracks = Array.from(root.getElementsByTagNameNS('*', 'trk'));
  for (const trk of tracks) {
    for (const seg of childElements(trk, 'trkseg')) {
      const points: GpxPoint[] = [];
      for (const pt of childElements(seg, 'trkpt')) {
        const point = pointFromElement(pt);
        if (point) points.push(point);
      }
      if (points.length) segments.push({ points });
    }
  }

  if (!segments.length) {
    const routes = Array.from(root.getElementsByTagNameNS('*', 'rte'));
    for (const rte of routes) {
      const points: GpxPoint[] = [];
      for (const pt of childElements(rte, 'rtept')) {
        const point = pointFromElement(pt);
        if (point) points.push(point);
      }
      if (points.length) segments.push({ points });
    }
  }

  if (!segments.length) throw new Error('No track or route points found.');

  return {
    id: crypto.randomUUID(),
    fileName,
    originalXml: xml,
    originalSegments: cloneSegments(segments),
    segments: cloneSegments(segments),
    importedAt: Date.now(),
  };
}
