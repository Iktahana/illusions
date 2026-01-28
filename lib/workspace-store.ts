// Cross-platform workspace state store for .mdi documents.
// Persists lastOpenedMdiPath and recent file list.
// Comments in code must be in English.

import { getRuntimeEnvironment, isBrowser, isElectronRenderer } from "./runtime-env";

export interface RecentMdiFile {
  path: string;
  name: string;
  lastAccessed: number;
}

export interface WorkspaceState {
  lastOpenedMdiPath: string | null;
  recentFiles: RecentMdiFile[];
}

export interface WorkspaceStore {
  getState(): Promise<WorkspaceState>;
  setLastOpenedMdiPath(path: string | null): Promise<void>;
  touchRecentFile(path: string): Promise<void>;
}

const BROWSER_STORAGE_KEY = "illusions.workspace.mdi.state.v1";

/**
 * Factory that returns the appropriate workspace store implementation
 * for the current runtime environment.
 */
export function createWorkspaceStore(): WorkspaceStore {
  if (isElectronRenderer()) {
    return new ElectronWorkspaceStore();
  }
  if (isBrowser()) {
    return new BrowserWorkspaceStore();
  }
  return new NoopWorkspaceStore();
}

class BrowserWorkspaceStore implements WorkspaceStore {
  async getState(): Promise<WorkspaceState> {
    if (!isBrowser()) {
      return { lastOpenedMdiPath: null, recentFiles: [] };
    }
    try {
      const raw = window.localStorage.getItem(BROWSER_STORAGE_KEY);
      if (!raw) {
        return { lastOpenedMdiPath: null, recentFiles: [] };
      }
      const parsed = JSON.parse(raw) as WorkspaceState;
      return {
        lastOpenedMdiPath: parsed.lastOpenedMdiPath ?? null,
        recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
      };
    } catch {
      return { lastOpenedMdiPath: null, recentFiles: [] };
    }
  }

  async setLastOpenedMdiPath(path: string | null): Promise<void> {
    if (!isBrowser()) return;
    const state = await this.getState();
    const next: WorkspaceState = {
      ...state,
      lastOpenedMdiPath: path,
    };
    window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(next));
  }

  async touchRecentFile(path: string): Promise<void> {
    if (!isBrowser()) return;
    const state = await this.getState();
    const now = Date.now();
    const name = basename(path);

    const existing = state.recentFiles.filter((f) => f.path !== path);
    const nextFiles: RecentMdiFile[] = [
      { path, name, lastAccessed: now },
      ...existing,
    ].slice(0, 20);

    const next: WorkspaceState = {
      lastOpenedMdiPath: path,
      recentFiles: nextFiles,
    };

    window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(next));
  }
}

/**
 * Electron workspace store.
 *
 * The main process is responsible for persisting workspace state
 * (for example using lowdb and a JSON file in app.getPath("userData")).
 * This renderer-side implementation talks to it via IPC exposed
 * through the preload script.
 */
class ElectronWorkspaceStore implements WorkspaceStore {
  async getState(): Promise<WorkspaceState> {
    if (!isElectronRenderer() || !window.electronAPI?.getWorkspaceState) {
      return { lastOpenedMdiPath: null, recentFiles: [] };
    }
    try {
      const raw = (await window.electronAPI.getWorkspaceState()) as
        | {
            lastOpenedMdiPath?: string | null;
            recentFiles?: { path: string; name?: string; lastAccessed?: number }[];
          }
        | null
        | undefined;
      const lastOpenedMdiPath =
        raw?.lastOpenedMdiPath ?? null;
      const recentFilesRaw =
        raw?.recentFiles ??
        [];

      const recentFiles: RecentMdiFile[] = recentFilesRaw
        .filter((f) => typeof f.path === "string")
        .map((f) => ({
          path: f.path,
          name: f.name ?? basename(f.path),
          lastAccessed: typeof f.lastAccessed === "number" ? f.lastAccessed : Date.now(),
        }));

      return {
        lastOpenedMdiPath,
        recentFiles,
      };
    } catch (error) {
      console.error("Failed to read Electron workspace state:", error);
      return { lastOpenedMdiPath: null, recentFiles: [] };
    }
  }

  async setLastOpenedMdiPath(_path: string | null): Promise<void> {
    // This is intentionally a no-op on the renderer side.
    // The main process should own the persisted workspace state and
    // update lastOpenedMdiPath whenever a .mdi file is opened or saved.
  }

  async touchRecentFile(_path: string): Promise<void> {
    // Same as setLastOpenedMdiPath: main process is responsible for
    // updating the recent file list when .mdi files are opened or saved.
  }
}

class NoopWorkspaceStore implements WorkspaceStore {
  async getState(): Promise<WorkspaceState> {
    return { lastOpenedMdiPath: null, recentFiles: [] };
  }
  async setLastOpenedMdiPath(_path: string | null): Promise<void> {
    // no-op
  }
  async touchRecentFile(_path: string): Promise<void> {
    // no-op
  }
}

function basename(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || p;
}

