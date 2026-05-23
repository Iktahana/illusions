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
    case ".md":
      return "untitled.md";
    case ".txt":
      return "untitled.txt";
    default:
      return "untitled.mdi";
  }
}

/** Save dialog file type filters per file type */
function getSaveFilters(
  fileType: SupportedFileExtension,
): Array<{ description: string; accept: Record<string, string[]> }> {
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
 * .illusions MDI Document を保存する。
 *
 * Phase 2 shim: 保存経路を削除済み。production caller はすべて no-op shim 経由のため
 * この関数は実質呼ばれない。テスト互換性のため signature を維持し、常に null を返す。
 * Phase 8 で 2026-05-06 計画に従って再構築する。
 */
export async function saveMdiFile(_params: SaveMdiParams): Promise<OpenMdiResult | null> {
  return null;
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

function hasShowOpenFilePicker(w: Window): w is Window & {
  showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]>;
} {
  return "showOpenFilePicker" in w;
}

function hasShowSaveFilePicker(w: Window): w is Window & {
  showSaveFilePicker: (o?: object) => Promise<FileSystemFileHandle>;
} {
  return "showSaveFilePicker" in w;
}
