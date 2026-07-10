/**
 * GenjiProvider — local Genji dictionary provider.
 *
 * Electron (local dict installed): queries via IPC to the main-process SQLite.
 * Otherwise unavailable. illusions must not query the remote Genji API.
 */
import type { IDictProvider, DictEntry } from "../dict-types";

const PROVIDER_ID = "genji";
const DISPLAY_NAME = "幻辞";
const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Electron IPC helpers
// ---------------------------------------------------------------------------

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

/** Check whether the local Electron dict is installed and ready. */
async function isLocalAvailable(): Promise<boolean> {
  if (!isElectronDict()) return false;
  try {
    const status = await getElectronDictAPI().getStatus();
    return status.status === "installed";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class GenjiProvider implements IDictProvider {
  readonly id = PROVIDER_ID;
  readonly displayName = DISPLAY_NAME;

  async isAvailable(): Promise<boolean> {
    return isLocalAvailable();
  }

  async query(term: string, limit = DEFAULT_LIMIT): Promise<DictEntry[]> {
    if (isElectronDict()) {
      try {
        if (await isLocalAvailable()) {
          return await getElectronDictAPI().query(term, limit);
        }
      } catch {
        return [];
      }
    }
    return [];
  }

  async queryByReading(reading: string, limit = DEFAULT_LIMIT): Promise<DictEntry[]> {
    if (isElectronDict()) {
      try {
        if (await isLocalAvailable()) {
          return await getElectronDictAPI().queryByReading(reading, limit);
        }
      } catch {
        return [];
      }
    }
    return [];
  }
}
