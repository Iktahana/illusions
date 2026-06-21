import { getDefaultEditorSettings, getDefaultWorkspaceState } from "@/lib/project/project-types";
import { MAX_SNAPSHOTS, RETENTION_DAYS } from "@/lib/services/history-policy";

import type { ProjectConfig, SupportedFileExtension } from "@/lib/project/project-types";
import type { HistoryIndex } from "@/lib/services/history-policy";
import type { VFSDirectoryHandle } from "@/lib/vfs/types";

/** A directory handle that works for both VFS and Web File System Access API */
export type AnyDirectoryHandle = VFSDirectoryHandle | FileSystemDirectoryHandle;

/** Supported main-file extensions, in detection-priority order. */
const SUPPORTED_MAIN_EXTENSIONS: readonly SupportedFileExtension[] = [".mdi", ".md", ".txt"];

/**
 * Read text from a file handle (VFS or Web).
 *
 * #1888 scoping: this reads `.illusions` JSON metadata (project.json /
 * workspace.json / index.json), which is always app-written valid UTF-8. The
 * `getFile().text()` fallback is intentionally kept tolerant so a metadata read
 * never hard-fails on a stray byte. The strict/fatal UTF-8 decode that refuses
 * non-UTF-8 manuscripts is applied to the document content path instead — the
 * Web `WebVFSFileHandle.read()` used by ProjectService.readProjectContent.
 */
export async function readFileHandle(handle: {
  read?: () => Promise<string>;
  getFile?: () => Promise<File>;
}): Promise<string> {
  if (typeof handle.read === "function") {
    return handle.read();
  }
  const file = await handle.getFile!();
  return file.text();
}

/** Write text to a file handle (VFS `write` or Web `createWritable`). */
async function writeHandleText(
  handle: { write?: (s: string) => Promise<void> } | FileSystemFileHandle,
  text: string,
): Promise<void> {
  if ("write" in handle && typeof (handle as { write: unknown }).write === "function") {
    await (handle as { write: (s: string) => Promise<void> }).write(text);
  } else {
    const writable = await (handle as FileSystemFileHandle).createWritable();
    await writable.write(text);
    await writable.close();
  }
}

/**
 * Returns true if the file handle already holds non-empty content.
 * A freshly created (empty) handle counts as "missing" so callers can
 * populate it with defaults.
 */
async function fileHasContent(handle: Parameters<typeof readFileHandle>[0]): Promise<boolean> {
  try {
    const raw = await readFileHandle(handle);
    return raw.trim().length > 0;
  } catch {
    return false;
  }
}

/** List top-level file (non-directory) entry names in a directory handle. */
async function listFileNames(dir: AnyDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  const iterable = (
    dir as { entries: () => AsyncIterable<[string, { kind: "file" | "directory" }]> }
  ).entries();
  for await (const [name, entry] of iterable) {
    if (entry.kind === "file") names.push(name);
  }
  return names;
}

/**
 * Detect the most likely main file among existing files.
 * Priority: `${dirName}.<ext>` exact match, then any file by extension priority
 * (.mdi → .md → .txt). Returns undefined when no supported file exists.
 */
function detectMainFile(fileNames: string[], dirName: string): string | undefined {
  const candidates = fileNames.filter((n) =>
    SUPPORTED_MAIN_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)),
  );
  if (candidates.length === 0) return undefined;
  // Prefer a file named after the project directory.
  for (const ext of SUPPORTED_MAIN_EXTENSIONS) {
    const preferred = `${dirName}${ext}`;
    if (candidates.includes(preferred)) return preferred;
  }
  // Otherwise pick the first candidate by extension priority.
  for (const ext of SUPPORTED_MAIN_EXTENSIONS) {
    const found = candidates.find((n) => n.toLowerCase().endsWith(ext));
    if (found) return found;
  }
  return candidates[0];
}

/**
 * Read-only: open .illusions/project.json without creating anything.
 * Returns null if the directory or file does not exist.
 * Use this when restoring/opening an existing project — never auto-generate metadata.
 */
export async function readProjectJson(
  rootDirHandle: AnyDirectoryHandle,
): Promise<{ metadata: ProjectConfig; illusionsDir: AnyDirectoryHandle } | null> {
  let illusionsDir: AnyDirectoryHandle;
  try {
    illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions", { create: false });
  } catch {
    // .illusions/ directory does not exist
    return null;
  }

  let metadataText: string | undefined;
  try {
    const projectJsonHandle = await illusionsDir.getFileHandle("project.json", { create: false });
    const raw = await readFileHandle(projectJsonHandle as Parameters<typeof readFileHandle>[0]);
    if (raw.trim()) metadataText = raw;
  } catch {
    // project.json does not exist or is unreadable
    return null;
  }

  if (!metadataText) {
    return null;
  }

  try {
    return { metadata: JSON.parse(metadataText) as ProjectConfig, illusionsDir };
  } catch {
    // Corrupted project.json — treat as missing so the caller can self-heal.
    console.warn("[Project] project.json is corrupted (JSON.parse failed); treating as absent.");
    return null;
  }
}

/**
 * Ensure the full set of project management files exists, auto-repairing any
 * that are missing or empty: `.illusions/project.json`, `.illusions/workspace.json`
 * and `.illusions/history/index.json`.
 *
 * Unlike {@link readProjectJson} (read-only) and {@link ensureProjectJson}
 * (project.json + workspace.json only), this restores a project whose metadata
 * was lost — e.g. a Google Drive folder that still holds the manuscript but lost
 * its `project.json`. User content (the manuscript files) is never created here;
 * only the `.illusions/` management files are regenerated.
 *
 * @param rootDirHandle - The project root directory handle.
 * @param options.projectId - Reuse this id when (re)creating project.json so the
 *   recent-projects entry and persisted VFS approval stay consistent. Ignored
 *   when a valid project.json already exists.
 * @param options.mainFile - Known main file name. When omitted, the main file is
 *   detected by scanning existing files in the root directory.
 * @returns The project metadata, the `.illusions` dir handle, and `repaired`
 *   (true when any file had to be created).
 */
export async function ensureProjectFiles(
  rootDirHandle: AnyDirectoryHandle,
  options?: { projectId?: string; mainFile?: string },
): Promise<{ metadata: ProjectConfig; illusionsDir: AnyDirectoryHandle; repaired: boolean }> {
  let repaired = false;
  const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions", { create: true });

  // --- project.json ---
  // { create: true } so getFileHandle never throws ENOENT on the IPC layer;
  // an empty (just-created) file is treated as missing.
  const projectJsonHandle = await illusionsDir.getFileHandle("project.json", { create: true });
  let metadata!: ProjectConfig;
  let parsedSuccessfully = false;
  if (await fileHasContent(projectJsonHandle as Parameters<typeof readFileHandle>[0])) {
    const raw = await readFileHandle(projectJsonHandle as Parameters<typeof readFileHandle>[0]);
    try {
      metadata = JSON.parse(raw) as ProjectConfig;
      parsedSuccessfully = true;
    } catch {
      // project.json exists but is corrupted — back it up and regenerate.
      const backupName = `project.json.corrupt-${Date.now()}`;
      let backupSucceeded = false;
      try {
        const backupHandle = await illusionsDir.getFileHandle(backupName, { create: true });
        await writeHandleText(backupHandle, raw);
        backupSucceeded = true;
      } catch {
        // Backup failure is non-fatal; proceed with regeneration.
      }
      // #1567 item 16: report the backup outcome accurately.
      console.warn(
        backupSucceeded
          ? `[Project] project.json が破損しています。${backupName} に退避し、デフォルト設定で再生成します。`
          : `[Project] project.json が破損しています。バックアップ (${backupName}) の作成に失敗したため、退避せずにデフォルト設定で再生成します。`,
      );
    }
  }
  if (!parsedSuccessfully) {
    const dirName = rootDirHandle.name || "Untitled";
    let mainFile = options?.mainFile;
    if (!mainFile) {
      const fileNames = await listFileNames(rootDirHandle);
      mainFile = detectMainFile(fileNames, dirName);
    }
    const ext = (mainFile?.match(/\.\w+$/)?.[0] ?? ".mdi") as SupportedFileExtension;
    metadata = {
      version: "1.0.0",
      projectId: options?.projectId ?? crypto.randomUUID(),
      name: dirName,
      mainFile: mainFile ?? `${dirName}${ext}`,
      mainFileExtension: ext,
      createdAt: Date.now(),
      lastModified: Date.now(),
      editorSettings: getDefaultEditorSettings(ext),
    };
    await writeHandleText(projectJsonHandle, JSON.stringify(metadata, null, 2));
    repaired = true;
    console.info("[Project] Auto-repaired .illusions/project.json for:", dirName);
  }

  // --- workspace.json ---
  const wsHandle = await illusionsDir.getFileHandle("workspace.json", { create: true });
  if (!(await fileHasContent(wsHandle as Parameters<typeof readFileHandle>[0]))) {
    await writeHandleText(wsHandle, JSON.stringify(getDefaultWorkspaceState(), null, 2));
    repaired = true;
    console.info("[Project] Auto-repaired .illusions/workspace.json");
  }

  // --- history/index.json (best-effort) ---
  try {
    const historyDir = await illusionsDir.getDirectoryHandle("history", { create: true });
    const indexHandle = await historyDir.getFileHandle("index.json", { create: true });
    if (!(await fileHasContent(indexHandle as Parameters<typeof readFileHandle>[0]))) {
      const historyIndex: HistoryIndex = {
        snapshots: [],
        maxSnapshots: MAX_SNAPSHOTS,
        retentionDays: RETENTION_DAYS,
      };
      await writeHandleText(indexHandle, JSON.stringify(historyIndex, null, 2));
      repaired = true;
      console.info("[Project] Auto-repaired .illusions/history/index.json");
    }
  } catch {
    // history reconstruction is best-effort — never block opening the project.
  }

  return { metadata, illusionsDir, repaired };
}
