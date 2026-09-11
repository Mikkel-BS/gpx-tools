export interface DecorationOptions {
  attribution?: string;
  scaleBarMeters?: number;
  northArrow?: boolean;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${Number((meters / 1000).toPrecision(3))} km`;
  return `${Math.round(meters)} m`;
}

export function chooseNiceScaleDistance(targetMeters: number): number {
  if (!Number.isFinite(targetMeters) || targetMeters <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(targetMeters));
  const normalized = targetMeters / power;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * power;
}

export function drawExportDecorations(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  metersPerPixel: number,
  options: DecorationOptions,
): void {
  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.018));
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.012));
  context.save();
  context.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textBaseline = 'middle';

  if (options.scaleBarMeters && metersPerPixel > 0) {
    const barMeters = chooseNiceScaleDistance(options.scaleBarMeters);
    const barPixels = barMeters / metersPerPixel;
    if (barPixels > 20 && barPixels < width * 0.45) {
      const x = margin;
      const y = height - margin - fontSize * 1.7;
      context.fillStyle = 'rgba(255,255,255,.9)';
      context.fillRect(x - 8, y - 14, barPixels + 16, fontSize * 2.7);
      context.strokeStyle = '#111';
      context.lineWidth = Math.max(2, fontSize / 8);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + barPixels, y);
      context.moveTo(x, y - 6);
      context.lineTo(x, y + 6);
      context.moveTo(x + barPixels, y - 6);
      context.lineTo(x + barPixels, y + 6);
      context.stroke();
      context.fillStyle = '#111';
      context.fillText(formatDistance(barMeters), x, y + fontSize * 1.25);
    }
  }

  if (options.northArrow) {
    const x = width - margin - fontSize;
    const y = margin + fontSize * 1.8;
    context.fillStyle = 'rgba(255,255,255,.9)';
    context.fillRect(x - fontSize * 1.2, y - fontSize * 1.9, fontSize * 2.4, fontSize * 3.1);
    context.fillStyle = '#111';
    context.textAlign = 'center';
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    context.fillText('N', x, y - fontSize);
    context.beginPath();
    context.moveTo(x, y - fontSize * 0.45);
    context.lineTo(x - fontSize * 0.45, y + fontSize * 0.65);
    context.lineTo(x, y + fontSize * 0.35);
    context.lineTo(x + fontSize * 0.45, y + fontSize * 0.65);
    context.closePath();
    context.fill();
  }

  if (options.attribution) {
    context.font = `${Math.max(10, Math.round(fontSize * 0.82))}px system-ui, sans-serif`;
    context.textAlign = 'right';
    const text = options.attribution;
    const metrics = context.measureText(text);
    const x = width - margin;
    const y = height - margin;
    context.fillStyle = 'rgba(255,255,255,.92)';
    context.fillRect(x - metrics.width - 10, y - fontSize, metrics.width + 14, fontSize * 1.6);
    context.fillStyle = '#222';
    context.fillText(text, x, y - fontSize * 0.2);
  }

  context.restore();
}
