/**
 * Storage Service Factory.
 * Automatically detects environment and returns the appropriate storage provider.
 * Provides a singleton instance for application-wide use.
 */

import type { IStorageService } from "./storage-types";
import { isElectronEnvironment } from "./storage-types";
import WebStorageProvider from "./web-storage";
import ElectronStorageProvider from "./electron-storage";

let instance: IStorageService | null = null;

/**
 * Create a storage service provider based on the current environment.
 * - Electron renderer: Uses IPC-based storage (communicates with main process SQLite)
 * - Browser: Uses IndexedDB-based storage
 */
export function createStorageService(): IStorageService {
  if (isElectronEnvironment()) {
    return new ElectronStorageProvider();
  } else {
    return new WebStorageProvider();
  }
}

/**
 * Get or create the global storage service instance.
 * This ensures a single storage service is used throughout the application.
 */
export function getStorageService(): IStorageService {
  if (!instance) {
    instance = createStorageService();
  }
  return instance;
}

/**
 * Reset the storage service instance (useful for testing).
 */
export function resetStorageService(): void {
  instance = null;
}

export default getStorageService;
