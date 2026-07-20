/**
 * DictService — singleton that manages registered dictionary providers
 * and aggregates query results across them.
 *
 * Usage:
 *   import { getDictService } from "@/lib/dict/dict-service";
 *   const results = await getDictService().query("雪");
 */
import type {
  IDictProvider,
  DictEntry,
  DictQueryResult,
  DictDownloadState,
  DictUpdateResult,
} from "./dict-types";
import { GenjiProvider } from "./providers/genji-provider";

// Deduplication key: (entry, reading.primary) — preserves homonyms that share
// a surface form but differ in reading.
function dedupKey(e: DictEntry): string {
  return `${e.entry}\0${e.reading.primary}`;
}

function dedup(entries: DictEntry[]): DictEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const k = dedupKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

class DictService {
  private readonly providers: IDictProvider[] = [];

  registerProvider(provider: IDictProvider): void {
    if (this.providers.some((p) => p.id === provider.id)) return;
    this.providers.push(provider);
  }

  /**
   * Query all registered providers in parallel and merge results.
   * Deduplicates by (entry, reading.primary).
   */
  async query(term: string, limit = 20): Promise<DictQueryResult> {
    if (this.providers.length === 0) {
      return { entries: [], noResults: false, providerUnavailable: true };
    }

    const results = await Promise.all(
      this.providers.map(async (p) => {
        const available = await p.isAvailable();
        if (!available) {
          return { entries: [] as DictEntry[], available: false };
        }
        const entries = await p.query(term, limit);
        return { entries, available: true };
      }),
    );

    const allEntries = dedup(results.flatMap((r) => r.entries));
    const anyAvailable = results.some((r) => r.available);

    return {
      entries: allEntries,
      noResults: anyAvailable && allEntries.length === 0,
      providerUnavailable: !anyAvailable,
    };
  }

  /**
   * Query by kana reading for homophone lookup.
   */
  async queryByReading(reading: string, limit = 20): Promise<DictQueryResult> {
    if (this.providers.length === 0) {
      return { entries: [], noResults: false, providerUnavailable: true };
    }

    const results = await Promise.all(
      this.providers.map(async (p) => {
        const available = await p.isAvailable();
        if (!available) return { entries: [] as DictEntry[], available: false };
        const entries = await p.queryByReading(reading, limit);
        return { entries, available: true };
      }),
    );

    const allEntries = dedup(results.flatMap((r) => r.entries));
    const anyAvailable = results.some((r) => r.available);

    return {
      entries: allEntries,
      noResults: anyAvailable && allEntries.length === 0,
      providerUnavailable: !anyAvailable,
    };
  }

  /**
   * Get download/install state for the given provider.
   * Only works in Electron (IPC).
   */
  async getDownloadState(providerId: string): Promise<DictDownloadState> {
    const electronAPI = (
      window as Window & {
        electronAPI?: {
          dict?: { getStatus: () => Promise<Omit<DictDownloadState, "providerId">> };
        };
      }
    ).electronAPI;

    if (!electronAPI?.dict) {
      return { providerId, status: "not-installed" };
    }

    try {
      const raw = await electronAPI.dict.getStatus();
      return { providerId, ...raw };
    } catch {
      return { providerId, status: "error", error: "状態の取得に失敗しました" };
    }
  }

  /**
   * Check GitHub Releases for an update to the given provider's dictionary.
   * Calls `electronAPI.dict.checkUpdate()` (IPC `dict:check-update`) which hits
   * the network and returns `{ latestVersion, installedVersion, updateAvailable }`.
   *
   * Returns null on Web (no electronAPI.dict) and throws on IPC/network failure
   * so the caller can decide whether to surface the error.
   */
  async checkForUpdate(_providerId: string): Promise<DictUpdateResult | null> {
    const electronAPI = (
      window as Window & {
        electronAPI?: {
          dict?: { checkUpdate: () => Promise<DictUpdateResult> };
        };
      }
    ).electronAPI;

    if (!electronAPI?.dict?.checkUpdate) {
      return null;
    }

    return electronAPI.dict.checkUpdate();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: DictService | null = null;

export function getDictService(): DictService {
  if (!_instance) {
    _instance = new DictService();
    // Auto-register the built-in Genji provider
    _instance.registerProvider(new GenjiProvider());
  }
  return _instance;
}
