/**
 * Storage Service Factory.
 * Provides the Electron renderer storage provider.
 * Provides a singleton instance for application-wide use.
 */

import type { IStorageService } from "./storage-types";
import ElectronStorageProvider from "@/platform/electron-renderer/storage";

let instance: IStorageService | null = null;

/**
 * Create the IPC-based storage provider backed by main-process SQLite.
 */
export function createStorageService(): IStorageService {
  return new ElectronStorageProvider();
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
