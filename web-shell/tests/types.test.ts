import { describe, it, expect } from 'vitest';
import {
  parseSlotmapAttr,
  slotmapIdToField,
  ok,
  err,
} from '../src/types.js';

describe('SlotmapId helpers', () => {
  it('parseSlotmapAttr parses "0:0" correctly', () => {
    const result = parseSlotmapAttr('0:0');
    expect(result).toEqual({ idx: 0, version: 0 });
  });

  it('parseSlotmapAttr parses "5:3" correctly', () => {
    const result = parseSlotmapAttr('5:3');
    expect(result).toEqual({ idx: 5, version: 3 });
  });

  it('parseSlotmapAttr parses "4294967295:1" (default/null slotmap key)', () => {
    const result = parseSlotmapAttr('4294967295:1');
    expect(result).toEqual({ idx: 4294967295, version: 1 });
  });

  it('parseSlotmapAttr returns null for non-numeric parts', () => {
    expect(parseSlotmapAttr('abc:def')).toBeNull();
  });

  it('parseSlotmapAttr returns null for partial value', () => {
    expect(parseSlotmapAttr('5')).toBeNull();
  });

  it('parseSlotmapAttr returns null for empty string', () => {
    expect(parseSlotmapAttr('')).toBeNull();
  });

  it('parseSlotmapAttr returns null for negative numbers', () => {
    expect(parseSlotmapAttr('-1:0')).toBeNull();
  });

  it('parseSlotmapAttr returns null for extra colons', () => {
    expect(parseSlotmapAttr('1:2:3')).toBeNull();
  });

  it('slotmapIdToField converts SlotmapId to plain object', () => {
    const id = { idx: 3, version: 1 };
    expect(slotmapIdToField(id)).toEqual({ idx: 3, version: 1 });
  });

  it('slotmapIdToField round-trips with parseSlotmapAttr', () => {
    const parsed = parseSlotmapAttr('7:2');
    expect(parsed).not.toBeNull();
    if (parsed) {
      const field = slotmapIdToField(parsed);
      expect(field).toEqual({ idx: 7, version: 2 });
    }
  });

  it('parseSlotmapAttr with leading zeros works', () => {
    const result = parseSlotmapAttr('00:01');
    expect(result).toEqual({ idx: 0, version: 1 });
  });
});

describe('Result helpers', () => {
  it('ok creates a success result', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(42);
    }
  });

  it('err creates a failure result', () => {
    const r = err('something bad');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('something bad');
    }
  });
});
