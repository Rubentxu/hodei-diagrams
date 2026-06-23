import { describe, it, expect } from 'vitest';
import { parseSvgDimensions } from '../src/export-raster.js';

describe('parseSvgDimensions', () => {
  it('parses width and height attributes', () => {
    const svg = '<svg width="640" height="480"><rect/></svg>';
    expect(parseSvgDimensions(svg)).toEqual({ width: 640, height: 480 });
  });

  it('parses width and height with px suffix', () => {
    const svg = '<svg width="800px" height="600px"><rect/></svg>';
    expect(parseSvgDimensions(svg)).toEqual({ width: 800, height: 600 });
  });

  it('parses viewBox when width/height missing', () => {
    const svg = '<svg viewBox="0 0 1920 1080"><rect/></svg>';
    expect(parseSvgDimensions(svg)).toEqual({ width: 1920, height: 1080 });
  });

  it('parses viewBox with comma-separated values', () => {
    const svg = '<svg viewBox="0,0,400,300"><rect/></svg>';
    expect(parseSvgDimensions(svg)).toEqual({ width: 400, height: 300 });
  });

  it('prefers width/height over viewBox', () => {
    const svg = '<svg width="100" height="200" viewBox="0 0 1920 1080"><rect/></svg>';
    expect(parseSvgDimensions(svg)).toEqual({ width: 100, height: 200 });
  });

  it('falls back to 800x600 when no dimensions found', () => {
    const svg = '<svg><rect/></svg>';
    expect(parseSvgDimensions(svg)).toEqual({ width: 800, height: 600 });
  });

  it('handles fractional dimensions', () => {
    const svg = '<svg width="100.5" height="200.5"><rect/></svg>';
    expect(parseSvgDimensions(svg)).toEqual({ width: 100.5, height: 200.5 });
  });

  it('handles viewBox with fractional values', () => {
    const svg = '<svg viewBox="0.0 0.0 100.5 200.5"><rect/></svg>';
    expect(parseSvgDimensions(svg)).toEqual({ width: 100.5, height: 200.5 });
  });
});
