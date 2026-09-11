export interface ImageLayoutPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
}

export interface ImageExportDimensions {
  widthMm: number;
  heightMm: number;
  dpi: number;
  widthPx: number;
  heightPx: number;
  aspect: number;
}

export const imageLayoutPresets: ImageLayoutPreset[] = [
  { id: 'book-landscape', label: 'Book landscape · 160 × 100 mm', widthMm: 160, heightMm: 100, dpi: 300 },
  { id: 'book-portrait', label: 'Book portrait · 100 × 160 mm', widthMm: 100, heightMm: 160, dpi: 300 },
  { id: 'book-wide', label: 'Book wide · 180 × 90 mm', widthMm: 180, heightMm: 90, dpi: 300 },
  { id: 'square', label: 'Square · 120 × 120 mm', widthMm: 120, heightMm: 120, dpi: 300 },
];

export function mmToPixels(mm: number, dpi: number): number {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}

export function makeImageDimensions(widthMm: number, heightMm: number, dpi: number): ImageExportDimensions {
  if (!Number.isFinite(widthMm) || widthMm <= 0) throw new Error('Image width must be greater than zero.');
  if (!Number.isFinite(heightMm) || heightMm <= 0) throw new Error('Image height must be greater than zero.');
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 600) throw new Error('DPI must be between 72 and 600.');
  const widthPx = mmToPixels(widthMm, dpi);
  const heightPx = mmToPixels(heightMm, dpi);
  if (widthPx * heightPx > 25_000_000) {
    throw new Error('Export is limited to 25 megapixels to avoid excessive browser memory use.');
  }
  return { widthMm, heightMm, dpi, widthPx, heightPx, aspect: widthPx / heightPx };
}

export function getImageLayoutPreset(id: string): ImageLayoutPreset {
  return imageLayoutPresets.find((preset) => preset.id === id) ?? imageLayoutPresets[0];
}
