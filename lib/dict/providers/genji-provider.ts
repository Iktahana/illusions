/**
 * GenjiProvider
 *
 * Electron: delegates queries to the main process via IPC (window.electronAPI.dict).
 * Web: returns stub results with webApiPending flag until a real API is available.
 */
import type { IDictProvider, DictEntry } from "../dict-types";

const PROVIDER_ID = "genji";
const DISPLAY_NAME = "幻辞";
const DEFAULT_LIMIT = 20;

function isElectronDict(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as Window & { electronAPI?: { dict?: unknown } }).electronAPI?.dict
  );
}

function getElectronDictAPI() {
  const api = (
    window as Window & {
      electronAPI?: {
        dict?: {
          query: (term: string, limit: number) => Promise<DictEntry[]>;
          queryByReading: (reading: string, limit: number) => Promise<DictEntry[]>;
          getStatus: () => Promise<{ status: string; installedVersion?: string }>;
        };
      };
    }
  ).electronAPI?.dict;
  if (!api) throw new Error("electronAPI.dict is not available");
  return api;
}

export class GenjiProvider implements IDictProvider {
  readonly id = PROVIDER_ID;
  readonly displayName = DISPLAY_NAME;

  async isAvailable(): Promise<boolean> {
    if (!isElectronDict()) return false;
    try {
      const status = await getElectronDictAPI().getStatus();
      return status.status === "installed";
    } catch {
      return false;
    }
  }

  async query(term: string, limit = DEFAULT_LIMIT): Promise<DictEntry[]> {
    if (!isElectronDict()) return [];
    try {
      return await getElectronDictAPI().query(term, limit);
    } catch (err) {
      console.error(`[GenjiProvider] query failed:`, err);
      return [];
    }
  }

  async queryByReading(reading: string, limit = DEFAULT_LIMIT): Promise<DictEntry[]> {
    if (!isElectronDict()) return [];
    try {
      return await getElectronDictAPI().queryByReading(reading, limit);
    } catch (err) {
      console.error(`[GenjiProvider] queryByReading failed:`, err);
      return [];
    }
  }
}
