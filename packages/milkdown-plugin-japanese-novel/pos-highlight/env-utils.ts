/**
 * Environment detection utilities
 */

/**
 * Check if the code is running in Electron environment
 */
export function isElectron(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check for Electron-specific properties
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.indexOf(' electron/') > -1) {
    return true;
  }

  // Check for process.versions.electron
  if (typeof (window as any).process === 'object' && 
      (window as any).process.versions && 
      (window as any).process.versions.electron) {
    return true;
  }

  return false;
}

/**
 * Check if the code is running in a browser (not Electron)
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && !isElectron();
}
