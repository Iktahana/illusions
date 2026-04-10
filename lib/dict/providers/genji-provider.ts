/**
 * GenjiProvider — dual-backend dictionary provider.
 *
 * Electron (local dict installed): queries via IPC to the main-process SQLite.
 * Otherwise (web, or Electron without local dict): falls back to Genji REST API.
 */
import type { IDictProvider, DictEntry } from "../dict-types";
import * as GenjiApiBackend from "./genji-api-backend";

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

  /**
   * Always available — local IPC or remote API.
   * Does NOT hit the network; remote availability is assumed and errors
   * are handled gracefully in query methods.
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async query(term: string, limit = DEFAULT_LIMIT): Promise<DictEntry[]> {
    // Try local backend first (Electron with installed dict)
    if (isElectronDict()) {
      try {
        if (await isLocalAvailable()) {
          const results = await getElectronDictAPI().query(term, limit);
          if (results.length > 0) return results;
        }
      } catch {
        // Fall through to remote
      }
    }

    // Remote fallback
    return GenjiApiBackend.queryByEntry(term, limit);
  }

  async queryByReading(reading: string, limit = DEFAULT_LIMIT): Promise<DictEntry[]> {
    // Try local backend first
    if (isElectronDict()) {
      try {
        if (await isLocalAvailable()) {
          const results = await getElectronDictAPI().queryByReading(reading, limit);
          if (results.length > 0) return results;
        }
      } catch {
        // Fall through to remote
      }
    }

    // Remote fallback
    return GenjiApiBackend.queryByReading(reading, limit);
  }
}
