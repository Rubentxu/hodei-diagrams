import { describe, it, expect } from 'vitest';
import { ICONS, CATEGORY_ICONS_SVG, categoryIcon } from '../src/icon.js';

describe('icon', () => {
  describe('ICONS', () => {
    it('every ICONS entry contains an svg element', () => {
      for (const [key, svg] of Object.entries(ICONS)) {
        expect(svg, `ICONS.${key} should contain <svg>`).toContain('<svg');
      }
    });

    it('every ICONS entry uses canonical geometry (viewBox="0 0 16 16")', () => {
      for (const [key, svg] of Object.entries(ICONS)) {
        expect(svg, `ICONS.${key} should have 16×16 viewBox`).toContain('viewBox="0 0 16 16"');
        expect(svg, `ICONS.${key} should use currentColor`).toContain('currentColor');
      }
    });

    it('every ICONS entry has stroke-width="1.5"', () => {
      for (const [key, svg] of Object.entries(ICONS)) {
        expect(svg, `ICONS.${key} should have stroke-width="1.5"`).toContain('stroke-width="1.5"');
      }
    });

    it('BRAND, UNDO, REDO, TEXT, ZOOM_FIT, HELP, CLEAN, ERROR keys are all present', () => {
      expect(ICONS).toHaveProperty('BRAND');
      expect(ICONS).toHaveProperty('UNDO');
      expect(ICONS).toHaveProperty('REDO');
      expect(ICONS).toHaveProperty('TEXT');
      expect(ICONS).toHaveProperty('ZOOM_FIT');
      expect(ICONS).toHaveProperty('HELP');
      expect(ICONS).toHaveProperty('CLEAN');
      expect(ICONS).toHaveProperty('ERROR');
    });
  });

  describe('CATEGORY_ICONS_SVG', () => {
    it('has exactly 17 entries', () => {
      expect(Object.keys(CATEGORY_ICONS_SVG)).toHaveLength(17);
    });

    it('every entry contains <svg', () => {
      for (const [cat, svg] of Object.entries(CATEGORY_ICONS_SVG)) {
        expect(svg, `${cat} should contain <svg>`).toContain('<svg');
      }
    });

    it('includes all required category keys', () => {
      const required = [
        'General', 'Stencils', 'Arrows', 'Flowchart', 'UML', 'BPMN',
        'AWS', 'Azure', 'GCP', 'Kubernetes', 'Terraform', 'Jenkins',
        'Databases', 'C4', 'Network', 'Database', 'Mockups',
      ];
      for (const key of required) {
        expect(CATEGORY_ICONS_SVG, `${key} should be present`).toHaveProperty(key);
      }
    });

    it('Databases and Database map to the same SVG (duplicate key tolerance)', () => {
      expect(CATEGORY_ICONS_SVG['Databases']).toBe(CATEGORY_ICONS_SVG['Database']);
    });
  });

  describe('categoryIcon()', () => {
    it('returns an SVG string for a known category', () => {
      const result = categoryIcon('General');
      expect(result).toContain('<svg');
      expect(result).toContain('viewBox="0 0 16 16"');
    });

    it('returns a fallback SVG for an unknown category', () => {
      const result = categoryIcon('NonExistent');
      expect(result).toContain('<svg');
      expect(result).toContain('viewBox="0 0 16 16"');
    });

    it('fallback is different from a known icon', () => {
      const fallback = categoryIcon('UnknownCategoryXYZ');
      const general = categoryIcon('General');
      expect(fallback).not.toBe(general);
    });
  });
});
