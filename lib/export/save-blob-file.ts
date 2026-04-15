/**
 * Shared file-save helper for browser and Electron.
 *
 * - Electron (TXT only): delegates to the main-process IPC save dialog.
 *   Returns false when the user cancels the save dialog.
 * - Web: always triggers a browser download via a temporary Blob URL.
 *   Returns true unconditionally (browser downloads have no cancel signal).
 *
 * Other Electron formats (PDF, DOCX, EPUB) use dedicated IPC export handlers
 * and never reach this function.
 */

/**
 * Save a Blob to a file.
 *
 * @param blob - Blob content to write
 * @param suggestedName - Default file name for the download / save dialog
 * @param isElectron - True when running inside Electron renderer
 * @param electronExt - File extension for Electron save dialog. Currently only
 *   ".txt" is routed through Electron IPC here.
 * @returns true if saved/downloaded, false if user cancelled (Electron only)
 */
export async function saveBlobFile(
  blob: Blob,
  suggestedName: string,
  isElectron: boolean,
  electronExt?: string,
): Promise<boolean> {
  // Electron: delegate to main-process IPC (currently only TXT is routed here;
  // other formats use dedicated IPC export handlers)
  if (isElectron && window.electronAPI && electronExt === ".txt") {
    const text = await blob.text();
    const result = await window.electronAPI.saveFile(null, text, electronExt);
    if (result === null) return false;
    if (typeof result === "object" && "success" in result && !result.success) {
      throw new Error(result.error);
    }
    return true;
  }

  // Web: trigger download via Blob URL
  downloadViaBlob(blob, suggestedName);
  return true;
}

/**
 * Download a Blob via a temporary <a> element. Always works without a user gesture.
 */
function downloadViaBlob(blob: Blob, suggestedName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
