import type { AppState } from "./storage-types";
import { getStorageService } from "./storage-service";

export async function fetchAppState(): Promise<AppState | null> {
  const storage = getStorageService();
  await storage.initialize();
  return storage.loadAppState();
}

export async function persistAppState(updates: Partial<AppState>): Promise<AppState> {
  const storage = getStorageService();
  await storage.initialize();

  const existing = (await storage.loadAppState()) ?? {};
  const merged: AppState = {
    ...existing,
    ...updates,
  };

  await storage.saveAppState(merged);
  return merged;
}
