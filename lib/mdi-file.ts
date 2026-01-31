// クロスプラットフォームな .mdi ファイルの開閉/保存

import { getRuntimeEnvironment, isBrowser } from "./runtime-env";

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
      console.error("Electron IPC 経由で .mdi を保存できませんでした:", error);
      return null;
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
      handle = await window.showSaveFilePicker({
        suggestedName: ensureMdiExtension(descriptor?.name ?? "untitled.mdi"),
        types: [
          {
            description: "illusions MDI Document",
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
