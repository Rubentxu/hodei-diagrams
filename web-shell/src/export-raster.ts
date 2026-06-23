/**
 * export-raster.ts — PNG export via SVG rasterization
 *
 * Uses the Canvas API to rasterize SVG strings and trigger PNG downloads.
 * Fire-and-forget: errors are caught and logged but never propagate.
 */

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

/**
 * Parse SVG dimensions from an SVG string.
 *
 * Detection order:
 * 1. width / height attributes (with optional unit suffixes like "px")
 * 2. viewBox attribute
 * 3. Fallback to 800x600
 */
export function parseSvgDimensions(svg: string): { width: number; height: number } {
  // Try width/height attributes first
  const dimMatch = svg.match(
    /<svg[^>]*\swidth\s*=\s*["']?([\d.]+(?:px|pt|em|ex|%)?)/i,
  );
  const heightMatch = svg.match(
    /<svg[^>]*\sheight\s*=\s*["']?([\d.]+(?:px|pt|em|ex|%)?)/i,
  );

  if (dimMatch && heightMatch) {
    const w = parseFloat(dimMatch[1]!);
    const h = parseFloat(heightMatch[1]!);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
  }

  // Try viewBox as fallback
  const vbMatch = svg.match(
    /<svg[^>]*\sviewBox\s*=\s*["']([^"']+)/i,
  );
  if (vbMatch) {
    const parts = vbMatch[1]!.trim().split(/[\s,]+/);
    if (parts.length >= 4) {
      const w = parseFloat(parts[2]!);
      const h = parseFloat(parts[3]!);
      if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
        return { width: w, height: h };
      }
    }
  }

  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

/**
 * Rasterize an SVG string to a PNG and trigger browser download.
 *
 * Uses encodeURIComponent for Unicode-safe data URI construction.
 * Fire-and-forget: errors are caught and logged but never propagate.
 */
export function rasterizeSvgToPng(svg: string, filename: string): void {
  const { width, height } = parseSvgDimensions(svg);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[rasterizeSvgToPng] Could not get 2D context');
    return;
  }

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    // Use encodeURIComponent for Unicode-safe data URI
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };
  img.onerror = () => {
    console.error('[rasterizeSvgToPng] Failed to load SVG as image');
  };

  // Encode SVG as UTF-8 data URI using encodeURIComponent (not btoa — Unicode safe)
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  img.src = svgUrl;
}