// クロスプラットフォームな .mdi ファイルの開閉/保存

import { getRuntimeEnvironment, isBrowser } from "../utils/runtime-env";
import type { SupportedFileExtension } from "./project-types";

export interface MdiFileDescriptor {
  /** 絶対パス（Electron）/ ブラウザのファイルハンドル利用時は null */
  path: string | null;
  /** ブラウザでは File System Access API のハンドル / Electron では null */
  handle: FileSystemFileHandle | null;
  /** ファイル名（ベース名のみ） */
  name: string;
}

export interface OpenMdiResult {
  descriptor: MdiFileDescriptor;
  content: string;
}

export interface SaveMdiParams {
  descriptor: MdiFileDescriptor | null;
  content: string;
  fileType?: SupportedFileExtension;
}

/** Default file name for each file type */
function getDefaultFileName(fileType: SupportedFileExtension): string {
  switch (fileType) {
    case ".md": return "untitled.md";
    case ".txt": return "untitled.txt";
    default: return "untitled.mdi";
  }
}

/** Save dialog file type filters per file type */
function getSaveFilters(fileType: SupportedFileExtension): Array<{ description: string; accept: Record<string, string[]> }> {
  switch (fileType) {
    case ".md":
      return [
        { description: "Markdown", accept: { "text/markdown": [".md"] } },
        { description: "すべてのファイル", accept: { "*/*": [] } },
      ];
    case ".txt":
      return [
        { description: "テキストファイル", accept: { "text/plain": [".txt"] } },
        { description: "すべてのファイル", accept: { "*/*": [] } },
      ];
    default:
      return [
        { description: "illusions MDI Document", accept: { "text/plain": [".mdi"] } },
        { description: "すべてのファイル", accept: { "*/*": [] } },
      ];
  }
}

/**
 * .illusions MDI Documentを開く（Electron IPC / File System Access API）
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
      console.error("Electron IPC 経由で .mdi を開けませんでした:", error);
      return null;
    }
  }

  if (!isBrowser() || !hasShowOpenFilePicker(window)) {
    console.warn("この環境では File System Access API を利用できません。");
    return null;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: "illusions MDI Document",
          accept: {
            "text/plain": [".mdi"],
          },
        },
        {
          description: "すべてのファイル",
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
      console.error("File System Access API 経由で .mdi を開けませんでした:", error);
    }
    return null;
  }
}

/**
 * .illusions MDI Documentを保存する（可能なら既存ディスクリプタを再利用）
 * 新規の場合は「名前を付けて保存」相当のダイアログを出す
 */
export async function saveMdiFile(
  params: SaveMdiParams
): Promise<OpenMdiResult | null> {
  const env = getRuntimeEnvironment();
  const { descriptor, content, fileType = ".mdi" } = params;

  if (env === "electron-renderer" && window.electronAPI) {
    const existingPath = descriptor?.path ?? null;
    try {
      const result = await window.electronAPI.saveFile(existingPath, content, fileType);
      if (!result) {
        // User cancelled the save dialog
        return null;
      }
      // Check for structured error response from main process
      if (typeof result === "object" && "success" in result && !result.success) {
        throw new Error(
          (result as { error?: string }).error ?? "ファイルの保存に失敗しました"
        );
      }
      const savedPath = result as string;
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
      console.error("Electron IPC 経由で .mdi を保存できませんでした:", error);
      throw error;
    }
  }

  if (!isBrowser()) {
    console.warn("ブラウザ/Electron レンダラ以外では .mdi を保存できません。");
    return null;
  }

  if (!descriptor?.handle && !hasShowSaveFilePicker(window)) {
    console.warn("この環境では File System Access API による .mdi 保存ができません。");
    return null;
  }

  try {
    let handle = descriptor?.handle ?? null;

    if (!handle && hasShowSaveFilePicker(window)) {
      const defaultName = descriptor?.name ?? getDefaultFileName(fileType);
      const suggestedName = ensureExtension(defaultName, fileType);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: getSaveFilters(fileType),
      });
    }

    if (!handle) {
      return null;
    }

    // 永続化されたハンドルの場合、必要なら権限確認/要求を行う
    if (descriptor?.handle && "queryPermission" in handle) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const permission = await (handle as any).queryPermission({ mode: "readwrite" });
        if (permission !== "granted") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const requestResult = await (handle as any).requestPermission({ mode: "readwrite" });
          if (requestResult !== "granted") {
            console.warn("ファイルハンドルの書き込み権限が許可されませんでした");
            return null;
          }
        }
      } catch (err) {
        console.warn("権限確認に失敗しました（可能ならそのまま書き込みを試みます）:", err);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writable = await (handle as any).createWritable();
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
      console.error("File System Access API 経由で .mdi を保存できませんでした:", error);
    }
    return null;
  }
}

function basename(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || p;
}

/** Ensure the file name has the correct extension for its type */
function ensureExtension(name: string, fileType: SupportedFileExtension): string {
  if (name.toLowerCase().endsWith(fileType)) {
    return name;
  }
  // Remove any existing known extension before adding the correct one
  const withoutExt = name.replace(/\.(mdi|md|txt)$/i, "");
  return `${withoutExt}${fileType}`;
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
