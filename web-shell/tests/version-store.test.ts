/**
 * version-store.test.ts — Unit tests for VersionStore with fake-indexeddb.
 *
 * Run with: npm run test -- version-store
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { VersionStore } from '../src/version-store.js';

describe('VersionStore', () => {
  let store: VersionStore;

  beforeEach(() => {
    // Fresh instance per test to avoid cross-test contamination
    store = new VersionStore('test-hodei-diagrams-' + Math.random());
  });

  // ─── Task 2.3.3 ────────────────────────────────────────────────────────────
  it('list() returns [] on empty store', async () => {
    const versions = await store.list();
    expect(versions).toEqual([]);
  });

  // ─── Task 2.3.4 ────────────────────────────────────────────────────────────
  it('put() then list() returns exactly 1 record with matching id and current timestamp', async () => {
    const now = Date.now();
    const id = await store.put({
      name: 'Manual: v1',
      snapshot: '<mxfile>test</mxfile>',
      schema_version: 1,
    });

    const versions = await store.list();
    expect(versions).toHaveLength(1);
    expect(versions[0]!.id).toBe(id);
    expect(versions[0]!.name).toBe('Manual: v1');
    expect(versions[0]!.snapshot).toBe('<mxfile>test</mxfile>');
    expect(versions[0]!.schema_version).toBe(1);
    // Timestamp should be within 5 seconds of now
    expect(Math.abs(versions[0]!.updated.getTime() - now)).toBeLessThan(5_000);
    expect(Math.abs(versions[0]!.created.getTime() - now)).toBeLessThan(5_000);
  });

  // ─── Task 2.3.5 ────────────────────────────────────────────────────────────
  it('3 puts with distinct timestamps returns them in reverse-chronological order', async () => {
    // Insert with 100ms delays to ensure distinct updated timestamps
    await store.put({ name: 'v1', snapshot: 'xml1', schema_version: 1 });
    await delay(100);
    await store.put({ name: 'v2', snapshot: 'xml2', schema_version: 1 });
    await delay(100);
    await store.put({ name: 'v3', snapshot: 'xml3', schema_version: 1 });

    const versions = await store.list();
    expect(versions).toHaveLength(3);
    // Most recent first
    expect(versions[0]!.name).toBe('v3');
    expect(versions[1]!.name).toBe('v2');
    expect(versions[2]!.name).toBe('v1');
  });

  // ─── Task 2.3.6 ────────────────────────────────────────────────────────────
  it('get(unknownId) returns undefined, not throw', async () => {
    const result = await store.get('this-does-not-exist');
    expect(result).toBeUndefined();
  });

  // ─── Task 2.3.7 ────────────────────────────────────────────────────────────
  it('delete(existingId) removes the record — get returns undefined, list omits it, others unchanged', async () => {
    const id1 = await store.put({ name: 'v1', snapshot: 'xml1', schema_version: 1 });
    const id2 = await store.put({ name: 'v2', snapshot: 'xml2', schema_version: 1 });

    await store.delete(id1);

    expect(await store.get(id1)).toBeUndefined();
    const remaining = await store.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(id2);
    expect(remaining[0]!.name).toBe('v2');
  });

  // ─── Task 2.3.8 ────────────────────────────────────────────────────────────
  it('delete(unknownId) is idempotent — no throw', async () => {
    // Should not throw
    await store.delete('definitely-not-a-real-id');
    await store.delete('also-not-real');
    // Still no throw
    expect(true).toBe(true);
  });

  // ─── Task 2.3.9 ────────────────────────────────────────────────────────────
  it('every record has schema_version: 1', async () => {
    const id1 = await store.put({ name: 'v1', snapshot: 'xml1', schema_version: 1 });
    const id2 = await store.put({ name: 'v2', snapshot: 'xml2', schema_version: 1 });

    const v1 = await store.get(id1);
    const v2 = await store.get(id2);

    expect(v1?.schema_version).toBe(1);
    expect(v2?.schema_version).toBe(1);
  });

  // ─── Task 2.3.4 (metadata field) ──────────────────────────────────────────
  it('put() preserves optional metadata field', async () => {
    const metadata = JSON.stringify({ title: 'My Diagram', author: 'Test' });
    const id = await store.put({
      name: 'With metadata',
      snapshot: '<mxfile>test</mxfile>',
      metadata,
      schema_version: 1,
    });

    const record = await store.get(id);
    expect(record?.metadata).toBe(metadata);
    expect(JSON.parse(record?.metadata!)).toEqual({ title: 'My Diagram', author: 'Test' });
  });

  // ─── Task 2.3.5 (reverse-chronological: oldest first when using index directly) ─
  it('updated timestamp is set on every put call', async () => {
    const id1 = await store.put({ name: 'v1', snapshot: 'xml1', schema_version: 1 });
    await delay(50);
    const id2 = await store.put({ name: 'v2', snapshot: 'xml2', schema_version: 1 });

    const v1 = await store.get(id1);
    const v2 = await store.get(id2);

    expect(v1!.updated.getTime()).toBeLessThan(v2!.updated.getTime());
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
