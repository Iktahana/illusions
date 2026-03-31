import { getStorageService } from "@/lib/storage/storage-service";
import { persistAppState } from "@/lib/storage/app-state-manager";
import type { KeymapOverrides } from "./keymap-types";

/**
 * Persists user keymap overrides via StorageService.
 * Overrides are stored as part of AppState.keymapOverrides.
 */
export async function saveKeymapOverrides(overrides: KeymapOverrides): Promise<void> {
  await persistAppState({ keymapOverrides: overrides });
}

/**
 * Loads user keymap overrides from StorageService.
 * Returns an empty object if no overrides have been saved.
 */
export async function loadKeymapOverrides(): Promise<KeymapOverrides> {
  const storage = getStorageService();
  const appState = await storage.loadAppState();
  return appState?.keymapOverrides ?? {};
}
