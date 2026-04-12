/**
 * Shared file-save helper for browser and Electron.
 *
 * In Electron, delegates to the main-process IPC save dialog (TXT only).
 * In web browsers, tries the File System Access API (Chromium), then falls
 * back to a Blob URL download for other browsers or when the user gesture
 * has expired.
 */

/**
 * Save a Blob to a file.
 *
 * @param blob - Blob content to write
 * @param suggestedName - Default file name shown in the save dialog
 * @param accept - MIME type → extensions map for the file picker
 * @param isElectron - True when running inside Electron renderer
 * @param electronExt - File extension for Electron save dialog. Currently only
 *   ".txt" is routed through Electron IPC here; DOCX/EPUB/PDF use dedicated
 *   IPC export handlers and never reach this function in Electron mode.
 * @returns true if saved, false if user cancelled
 */
export async function saveBlobFile(
  blob: Blob,
  suggestedName: string,
  accept: Record<string, string[]>,
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

  // Web: try File System Access API (Chromium browsers).
  // showSaveFilePicker requires an active user gesture. When called after
  // async work (dynamic import + blob generation), the gesture may have expired,
  // causing AbortError, NotAllowedError, or SecurityError. AbortError means the
  // user explicitly cancelled; the others mean the gesture expired — in that case
  // we fall through to the Blob URL download fallback.
  if (hasShowSaveFilePicker(window)) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: suggestedName.split(".").pop()?.toUpperCase() ?? "ファイル",
            accept,
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "AbortError") return false; // user explicitly cancelled
      // Gesture expired or permission denied — fall through to download fallback
      if (name === "NotAllowedError" || name === "SecurityError") {
        // fall through below
      } else {
        throw error;
      }
    }
  }

  // Fallback: trigger download via Blob URL
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

/**
 * Type guard: checks whether window has the File System Access API showSaveFilePicker method.
 */
function hasShowSaveFilePicker(w: Window): w is Window & {
  showSaveFilePicker: (options?: object) => Promise<FileSystemFileHandle>;
} {
  return "showSaveFilePicker" in w;
}
