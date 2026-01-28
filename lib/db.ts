"use client";

import Dexie, { type Table } from "dexie";

export interface AutoSaveCacheEntry {
  id: string;
  content: string;
  last_updated: number;
}

export class AutoSaveDb extends Dexie {
  auto_save_cache!: Table<AutoSaveCacheEntry, string>;

  constructor() {
    super("IllusionsAutoSave");
    this.version(1).stores({
      auto_save_cache: "id, last_updated",
    });
  }
}

const db = new AutoSaveDb();

export const CACHE_ID_UNSAVED = "unsaved_draft";

/**
 * Upsert a stash entry. Overwrites existing row with same id.
 */
export async function upsertStash(id: string, content: string): Promise<void> {
  const last_updated = Date.now();
  await db.auto_save_cache.put({ id, content, last_updated });
}

/**
 * Get a stash entry by id, or null if not found.
 */
export async function getStash(id: string): Promise<AutoSaveCacheEntry | null> {
  const row = await db.auto_save_cache.get(id);
  return row ?? null;
}

/**
 * Delete a stash entry by id.
 */
export async function deleteStash(id: string): Promise<void> {
  await db.auto_save_cache.delete(id);
}

export default db;
