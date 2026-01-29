/**
 * Storage abstraction layer types and interfaces.
 * Provides a unified API for Web (IndexedDB) and Electron (SQLite) storage.
 */
/**
 * Type guard to determine if we're in Electron environment.
 */
export function isElectronEnvironment() {
    if (typeof window === "undefined")
        return false;
    return typeof window.electronAPI !== "undefined";
}
//# sourceMappingURL=storage-types.js.map