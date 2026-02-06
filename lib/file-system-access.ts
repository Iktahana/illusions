/**
 * File System Access API utilities for Web file saving
 * Falls back to download method if API is not supported
 */

// Extend Window interface for File System Access API
declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: {
    description: string;
    accept: Record<string, string[]>;
  }[];
}

interface FileSystemFileHandle {
  createWritable: () => Promise<FileSystemWritableFileStream>;
  name: string;
}

interface FileSystemWritableFileStream {
  write: (data: string | BufferSource | Blob) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Save file using File System Access API or download fallback
 * @param content - File content to save
 * @param suggestedName - Suggested filename
 * @returns File name if saved successfully, null if cancelled
 */
export async function saveFileWithPicker(
  content: string,
  suggestedName: string = 'untitled.mdi'
): Promise<{ fileName: string; handle: FileSystemFileHandle } | null> {
  try {
    // Check if File System Access API is supported
    if (!window.showSaveFilePicker) {
      // Fallback to download
      downloadFile(content, suggestedName);
      return { fileName: suggestedName, handle: null as any };
    }

    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{
        description: 'MDI Files',
        accept: { 'application/octet-stream': ['.mdi'] },
      }],
    });

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();

    return { fileName: handle.name, handle };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // User cancelled
      return null;
    }
    console.error('Save file error:', err);
    // Fallback to download
    downloadFile(content, suggestedName);
    return { fileName: suggestedName, handle: null as any };
  }
}

/**
 * Save file directly to an existing file handle
 * @param handle - File system file handle
 * @param content - File content to save
 */
export async function saveFileDirectly(
  handle: FileSystemFileHandle,
  content: string
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Download file as fallback method
 * @param content - File content
 * @param filename - Filename
 */
function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}
