/**
 * DictAccess — consumer-facing facade over the Genji dictionary for analysis
 * features (型態分析 / 語彙統計 / 読みやすさ / ルビ) and lint rules.
 *
 * Why this exists separately from {@link getDictService}:
 *   `DictService.query()` returns full {@link DictEntry} objects by prefix match
 *   — right for the lookup panel, wrong for bulk analysis (heavy payloads, one
 *   round-trip per word, no freq_rank/register exposed). DictAccess adds the
 *   three primitives analysis needs:
 *     - getHealth()    — single source of truth for download presence + corruption
 *     - has()          — exact-match membership (lint "辞書外語" rule)
 *     - lookupBatch()  — many headwords in one IPC, lightweight projection, cached
 *
 * Graceful degradation: consumers should call getHealth() and only enrich when
 * `state === "ready"` (local Electron DB). On web the remote API still answers
 * single-word lookups (ruby), but bulk lookups are capped.
 *
 * Usage:
 *   import { getDictAccess } from "@/lib/dict/dict-access";
 *   const health = await getDictAccess().getHealth();
 *   if (health.state === "ready") {
 *     const map = await getDictAccess().lookupBatch(words);
 *   }
 */
import type { DictLookup } from "./dict-types";
import { LRUCache } from "@/shared/lib/lru-cache";
import * as GenjiApiBackend from "./providers/genji-api-backend";

export type GenjiHealthState = "ready" | "web-fallback" | "not-installed" | "corrupt" | "unknown";

export interface GenjiHealth {
  state: GenjiHealthState;
  installedVersion?: string;
  /** Japanese UI hint; populated for not-installed / corrupt / web-fallback. */
  message?: string;
}

interface ElectronDictApi {
  lookupBatch: (terms: string[]) => Promise<Array<{ entry: string } & DictLookup>>;
  verify: () => Promise<{ ok: boolean; reason?: string }>;
  getStatus: () => Promise<{ status: string; installedVersion?: string }>;
}

function getElectronDict(): ElectronDictApi | null {
  if (typeof window === "undefined") return null;
  return (
    (window as Window & { electronAPI?: { dict?: ElectronDictApi } }).electronAPI?.dict ?? null
  );
}

const CORRUPT_MESSAGE = "辞書データが破損しています。設定から再ダウンロードしてください。";

const HEALTH_TTL_MS = 5000;
const LOOKUP_CACHE_SIZE = 8000;
/** SQLite bind-variable limit is 999; stay comfortably under it per query. */
const LOCAL_BATCH_CHUNK = 400;
/** Cap web bulk lookups so analysis can't fan out into hundreds of requests. */
const REMOTE_MAX_TERMS = 300;

const MISS: DictLookup = Object.freeze({ found: false });

class DictAccess {
  private readonly cache = new LRUCache<string, DictLookup>(LOOKUP_CACHE_SIZE);
  private health: { value: GenjiHealth; at: number } | null = null;

  /**
   * Clear cached health + lookups. Call after a (re)download so newly installed
   * data and previously-cached negatives are re-evaluated.
   */
  invalidate(): void {
    this.health = null;
    this.cache.clear();
  }

  /** Resolve dictionary availability/health, cached for a few seconds. */
  async getHealth(): Promise<GenjiHealth> {
    const now = Date.now();
    if (this.health && now - this.health.at < HEALTH_TTL_MS) {
      return this.health.value;
    }
    const value = await this.computeHealth();
    this.health = { value, at: now };
    return value;
  }

  private async computeHealth(): Promise<GenjiHealth> {
    const dict = getElectronDict();
    if (!dict) {
      return {
        state: "web-fallback",
        message: "Web版ではオンライン辞典（幻辞API）を使用します。",
      };
    }
    try {
      const status = await dict.getStatus();
      if (status.status === "not-installed") {
        return { state: "not-installed", message: "辞書が未ダウンロードです。" };
      }
      if (status.status === "corrupt") {
        return {
          state: "corrupt",
          installedVersion: status.installedVersion,
          message: CORRUPT_MESSAGE,
        };
      }
      if (status.status === "installed") {
        // Proactively confirm integrity — catches a bad DB before the first query.
        const v = await dict.verify();
        if (!v.ok) {
          return {
            state: "corrupt",
            installedVersion: status.installedVersion,
            message: CORRUPT_MESSAGE,
          };
        }
        return { state: "ready", installedVersion: status.installedVersion };
      }
      return { state: "unknown" };
    } catch (err) {
      console.warn("[dict-access] health check failed:", err);
      return { state: "unknown" };
    }
  }

  /** Exact-match membership check (for the future 辞書外語 lint rule). */
  async has(term: string): Promise<boolean> {
    if (!term) return false;
    const result = await this.lookupBatch([term]);
    return result.get(term)?.found ?? false;
  }

  /**
   * Batch exact-match lookup. Returns a map keyed by every requested (deduped,
   * non-empty) term; misses map to `{ found: false }`. Cached per-term.
   */
  async lookupBatch(terms: string[]): Promise<Map<string, DictLookup>> {
    const out = new Map<string, DictLookup>();
    const misses: string[] = [];
    const seen = new Set<string>();

    for (const t of terms) {
      if (typeof t !== "string" || t.length === 0 || seen.has(t)) continue;
      seen.add(t);
      const cached = this.cache.get(t);
      if (cached !== undefined) {
        out.set(t, cached);
      } else {
        misses.push(t);
      }
    }
    if (misses.length === 0) return out;

    const dict = getElectronDict();
    if (dict) {
      await this.lookupLocal(dict, misses, out);
    } else {
      await this.lookupRemote(misses, out);
    }
    return out;
  }

  private async lookupLocal(
    dict: ElectronDictApi,
    misses: string[],
    out: Map<string, DictLookup>,
  ): Promise<void> {
    for (let i = 0; i < misses.length; i += LOCAL_BATCH_CHUNK) {
      const chunk = misses.slice(i, i + LOCAL_BATCH_CHUNK);
      let rows: Array<{ entry: string } & DictLookup>;
      try {
        rows = await dict.lookupBatch(chunk);
      } catch (err) {
        // A transient IPC error must NOT be recorded as "these words are absent":
        // leave the chunk unresolved (callers see no entry → treat as unknown,
        // never as out-of-dictionary) and let the next pass re-query. Caching a
        // synthetic MISS here would both poison the LRU and make the 辞書外語
        // lint rule flag every word until the dictionary is re-downloaded.
        console.warn("[dict-access] local lookupBatch failed:", err);
        continue;
      }

      const found = new Set<string>();
      for (const row of rows) {
        const { entry, ...rest } = row;
        const lookup: DictLookup = { ...rest, found: true };
        this.cache.set(entry, lookup);
        out.set(entry, lookup);
        found.add(entry);
      }
      // Cache negatives so repeated analysis doesn't re-query absent words. Only
      // safe after a SUCCESSFUL query — a genuine miss, not an I/O failure.
      for (const t of chunk) {
        if (!found.has(t)) {
          this.cache.set(t, MISS);
          out.set(t, MISS);
        }
      }
    }
  }

  private async lookupRemote(misses: string[], out: Map<string, DictLookup>): Promise<void> {
    const capped = misses.slice(0, REMOTE_MAX_TERMS);
    if (capped.length < misses.length) {
      console.warn(
        `[dict-access] remote lookup capped at ${REMOTE_MAX_TERMS}/${misses.length} terms`,
      );
    }

    let map: Map<string, DictLookup>;
    try {
      map = await GenjiApiBackend.lookupBatchRemote(capped);
    } catch (err) {
      // Same fail-safe as the local path: a network error must not be cached as
      // "absent". Leave the terms unresolved so a later request can retry and so
      // no consumer mistakes an I/O failure for an out-of-dictionary word.
      console.warn("[dict-access] remote lookupBatch failed:", err);
      return;
    }

    for (const t of capped) {
      const lookup = map.get(t) ?? MISS;
      this.cache.set(t, lookup);
      out.set(t, lookup);
    }
    // Terms beyond the cap: report as not-found WITHOUT caching, so a later
    // smaller request can still resolve them.
    for (const t of misses.slice(REMOTE_MAX_TERMS)) {
      if (!out.has(t)) out.set(t, MISS);
    }
  }
}

let _instance: DictAccess | null = null;

export function getDictAccess(): DictAccess {
  if (!_instance) {
    _instance = new DictAccess();
  }
  return _instance;
}

export type { DictAccess };
