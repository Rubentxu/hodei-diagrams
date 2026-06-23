/**
 * version-store.ts — IndexedDB persistence for diagram version snapshots.
 *
 * Each VersionRecord stores an opaque drawio XML snapshot and its metadata.
 * The shell treats the snapshot as opaque bytes — it never parses or inspects it.
 *
 * Schema:
 *   - Object store: `'versions'`
 *   - keyPath: `'id'`
 *   - Index: `'updated'` (for reverse-chronological listing)
 *
 * Invariants (from spec):
 *   - I2: shell stores opaque blobs, never parses drawio
 *   - I11: VersionStore never inspects or transforms the snapshot string
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** KeyPath + index fields */
export interface VersionRecord {
  /** Unique identifier (crypto.randomUUID) — keyPath */
  id: string;
  /** Human/auto label, e.g. "Manual: v1" or "Auto-save 14:32" */
  name: string;
  /** Opaque drawio XML snapshot — shell never parses this */
  snapshot: string;
  /** JSON.stringify(get_metadata()) — for full restore */
  metadata?: string;
  /** Forward-compat schema version — always 1 for MVP */
  schema_version: number;
  /** When this record was first created */
  created: Date;
  /** Last modified timestamp — used for reverse-chronological listing */
  updated: Date;
}

interface HodeiDBSchema extends DBSchema {
  versions: {
    key: string;
    value: VersionRecord;
    indexes: { 'by-updated': Date };
  };
}

const DB_NAME = 'hodei-diagrams';
const DB_VERSION = 1;
const STORE_NAME = 'versions';

export class VersionStore {
  private dbPromise: Promise<IDBPDatabase<HodeiDBSchema>>;

  constructor(dbName = DB_NAME) {
    this.dbPromise = openDB<HodeiDBSchema>(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-updated', 'updated');
        }
      },
    });
  }

  /**
   * Persist a new version record.
   * Generates a UUID id and timestamps created/updated to the current time.
   * Returns the generated id.
   */
  async put(record: Omit<VersionRecord, 'id' | 'created' | 'updated'>): Promise<string> {
    const db = await this.dbPromise;
    const now = new Date();
    const id = crypto.randomUUID();
    await db.put(STORE_NAME, {
      ...record,
      id,
      created: now,
      updated: now,
    });
    return id;
  }

  /**
   * List all versions in reverse-chronological order (most recent first).
   */
  async list(): Promise<VersionRecord[]> {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('by-updated');
    const records = await index.getAll();
    // Reverse order: most recent first
    return records.reverse();
  }

  /**
   * Retrieve a single version by id.
   * Returns undefined if the id is not found (does NOT throw).
   */
  async get(id: string): Promise<VersionRecord | undefined> {
    const db = await this.dbPromise;
    return (await db.get(STORE_NAME, id)) ?? undefined;
  }

  /**
   * Delete a version by id.
   * Idempotent: no-op if the id does not exist.
   */
  async delete(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(STORE_NAME, id);
  }
}
