import { describe, it, expect } from 'vitest';
import type { SelectionTarget, SelectionModifiers } from '../src/types.js';

// ─── SelectionTarget type tests ─────────────────────────────────────────────────

describe('SelectionTarget type', () => {
  it('None target has correct type', () => {
    const target: SelectionTarget = { type: 'None' };
    expect(target.type).toBe('None');
  });

  it('Vertex target has correct shape', () => {
    const target: SelectionTarget = { type: 'Vertex', id: { idx: 1, version: 1 } };
    expect(target.type).toBe('Vertex');
    expect(target.id).toEqual({ idx: 1, version: 1 });
  });

  it('Group target has correct shape', () => {
    const target: SelectionTarget = { type: 'Group', id: { idx: 2, version: 3 } };
    expect(target.type).toBe('Group');
    expect(target.id).toEqual({ idx: 2, version: 3 });
  });

  it('Edge target has correct shape', () => {
    const target: SelectionTarget = { type: 'Edge', id: { idx: 5, version: 0 } };
    expect(target.type).toBe('Edge');
    expect(target.id).toEqual({ idx: 5, version: 0 });
  });

  it('target id fields are typed as numbers', () => {
    const target: SelectionTarget = { type: 'Vertex', id: { idx: 100, version: 42 } };
    expect(typeof target.id.idx).toBe('number');
    expect(typeof target.id.version).toBe('number');
  });

  it('can narrow SelectionTarget with type guard', () => {
    const target: SelectionTarget = { type: 'Vertex', id: { idx: 1, version: 1 } };
    if (target.type === 'Vertex') {
      expect(target.id.idx).toBe(1);
    }
  });

  it('None target is not a Vertex/Group/Edge', () => {
    const target: SelectionTarget = { type: 'None' };
    // Type narrowing should not allow accessing id
    expect(target.type).toBe('None');
  });
});

// ─── SelectionModifiers type tests ─────────────────────────────────────────────

describe('SelectionModifiers type', () => {
  it('has all required boolean fields', () => {
    const mods: SelectionModifiers = {
      alt: false,
      shift: false,
      ctrl: false,
      meta: false,
    };
    expect(mods.alt).toBe(false);
    expect(mods.shift).toBe(false);
    expect(mods.ctrl).toBe(false);
    expect(mods.meta).toBe(false);
  });

  it('can represent alt-only modifier', () => {
    const mods: SelectionModifiers = {
      alt: true,
      shift: false,
      ctrl: false,
      meta: false,
    };
    expect(mods.alt).toBe(true);
  });

  it('can represent shift-only modifier', () => {
    const mods: SelectionModifiers = {
      alt: false,
      shift: true,
      ctrl: false,
      meta: false,
    };
    expect(mods.shift).toBe(true);
  });

  it('can represent ctrl+meta modifier (Cmd on Mac)', () => {
    const mods: SelectionModifiers = {
      alt: false,
      shift: false,
      ctrl: true,
      meta: true,
    };
    expect(mods.ctrl).toBe(true);
    expect(mods.meta).toBe(true);
  });
});

// ─── JSON serialization round-trip ─────────────────────────────────────────────

describe('SelectionTarget JSON serialization', () => {
  it('Vertex target serializes to correct JSON', () => {
    const target: SelectionTarget = { type: 'Vertex', id: { idx: 3, version: 1 } };
    const json = JSON.stringify(target);
    const parsed = JSON.parse(json) as SelectionTarget;
    expect(parsed.type).toBe('Vertex');
    expect(parsed).toEqual(target);
  });

  it('None target serializes to correct JSON', () => {
    const target: SelectionTarget = { type: 'None' };
    const json = JSON.stringify(target);
    const parsed = JSON.parse(json) as SelectionTarget;
    expect(parsed.type).toBe('None');
  });

  it('Group target round-trips through JSON', () => {
    const original: SelectionTarget = { type: 'Group', id: { idx: 7, version: 2 } };
    const json = JSON.stringify(original);
    const restored = JSON.parse(json) as SelectionTarget;
    expect(restored).toEqual(original);
  });

  it('Edge target round-trips through JSON', () => {
    const original: SelectionTarget = { type: 'Edge', id: { idx: 0, version: 1 } };
    const json = JSON.stringify(original);
    const restored = JSON.parse(json) as SelectionTarget;
    expect(restored).toEqual(original);
  });
});
