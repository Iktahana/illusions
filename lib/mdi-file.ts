// Cross-platform .mdi file open/save abstraction.
// Comments in code must be in English.

import { getRuntimeEnvironment, isBrowser } from "./runtime-env";

export interface MdiFileDescriptor {
  /** Absolute path on disk (Electron) or null when using browser file handles. */
  path: string | null;
  /** FileSystemAccessAPI handle in browsers, null in Electron. */
  handle: FileSystemFileHandle | null;
  /** File name (basename only). */
  name: string;
}

export interface OpenMdiResult {
  descriptor: MdiFileDescriptor;
  content: string;
}

export interface SaveMdiParams {
  descriptor: MdiFileDescriptor | null;
  content: string;
}

/**
 * Open a .mdi document, using Electron IPC or the File System Access API.
 */
export async function openMdiFile(): Promise<OpenMdiResult | null> {
  const env = getRuntimeEnvironment();

  if (env === "electron-renderer" && window.electronAPI) {
    try {
      const result = await window.electronAPI.openFile();
      if (!result) return null;
      const { path, content } = result;
      const name = basename(path);
      return {
        descriptor: {
          path,
          handle: null,
          name,
        },
        content,
      };
    } catch (error) {
      console.error("Failed to open .mdi file via Electron IPC:", error);
      return null;
    }
  }

  if (!isBrowser() || !hasShowOpenFilePicker(window)) {
    console.warn("File System Access API is not supported in this environment.");
    return null;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: "MDI Document",
          accept: {
            "text/plain": [".mdi"],
          },
        },
        {
          description: "All Files",
          accept: {
            "*/*": [],
          },
        },
      ],
      multiple: false,
      excludeAcceptAllOption: false,
    });

    const file = await handle.getFile();
    const text = await file.text();

    return {
      descriptor: {
        path: null,
        handle,
        name: file.name,
      },
      content: text,
    };
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") {
      console.error("Failed to open .mdi file via File System Access API:", error);
    }
    return null;
  }
}

/**
 * Save a .mdi document, reusing the existing descriptor when possible.
 * For new files, this will prompt the user with a "Save As" style dialog.
 */
export async function saveMdiFile(
  params: SaveMdiParams
): Promise<OpenMdiResult | null> {
  const env = getRuntimeEnvironment();
  const { descriptor, content } = params;

  if (env === "electron-renderer" && window.electronAPI) {
    const existingPath = descriptor?.path ?? null;
    try {
      const savedPath = await window.electronAPI.saveFile(existingPath, content);
      if (!savedPath) {
        return null;
      }
      const name = basename(savedPath);
      return {
        descriptor: {
          path: savedPath,
          handle: null,
          name,
        },
        content,
      };
    } catch (error) {
      console.error("Failed to save .mdi file via Electron IPC:", error);
      return null;
    }
  }

  if (!isBrowser()) {
    console.warn("Cannot save .mdi file outside of a browser or Electron renderer.");
    return null;
  }

  if (!descriptor?.handle && !hasShowSaveFilePicker(window)) {
    console.warn("File System Access API is not supported for saving .mdi.");
    return null;
  }

  try {
    let handle = descriptor?.handle ?? null;

    if (!handle && hasShowSaveFilePicker(window)) {
      handle = await window.showSaveFilePicker({
        suggestedName: ensureMdiExtension(descriptor?.name ?? "untitled.mdi"),
        types: [
          {
            description: "MDI Document",
            accept: {
              "text/plain": [".mdi"],
            },
          },
        ],
      });
    }

    if (!handle) {
      return null;
    }

    // Check and request permission if needed (for persisted handles)
    if (descriptor?.handle && "queryPermission" in handle) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permission = await (handle as any).queryPermission({ mode: "readwrite" });
        if (permission !== "granted") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const requestResult = await (handle as any).requestPermission({ mode: "readwrite" });
          if (requestResult !== "granted") {
            console.warn("Write permission not granted for file handle");
            return null;
          }
        }
      } catch (err) {
        console.warn("Permission check failed, attempting to write anyway:", err);
      }
    }

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();

    const file = await handle.getFile();

    return {
      descriptor: {
        path: null,
        handle,
        name: file.name,
      },
      content,
    };
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") {
      console.error("Failed to save .mdi file via File System Access API:", error);
    }
    return null;
  }
}

function basename(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || p;
}

function ensureMdiExtension(name: string): string {
  if (name.toLowerCase().endsWith(".mdi")) {
    return name;
  }
  return `${name}.mdi`;
}

function hasShowOpenFilePicker(
  w: Window
): w is Window & {
  showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]>;
} {
  return "showOpenFilePicker" in w;
}

function hasShowSaveFilePicker(
  w: Window
): w is Window & {
  showSaveFilePicker: (o?: object) => Promise<FileSystemFileHandle>;
} {
  return "showSaveFilePicker" in w;
}

