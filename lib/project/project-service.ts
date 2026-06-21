/**
 * Project CRUD service.
 * Handles creating, opening, saving, and managing projects.
 *
 * プロジェクトの作成・開閉・保存を管理するサービス。
 */

import { getProjectFileService } from "../services/project-file-service";
import { getProjectManager } from "./project-manager";
import { isElectronRenderer } from "../utils/runtime-env";
import { getDefaultEditorSettings, getDefaultWorkspaceState } from "./project-types";
import { readTextWithEncoding } from "@/shared/lib/text-codec";
import { ensureProjectFiles } from "../editor-page/project-file-utils";
import { notificationManager } from "../services/notification-manager";

import type { VirtualFileSystem, VFSDirectoryHandle } from "../vfs/types";
import type { ProjectManager } from "./project-manager";
import type {
  ProjectMode,
  StandaloneMode,
  SupportedFileExtension,
  ProjectConfig,
  WorkspaceState,
} from "./project-types";

/**
 * History index structure stored in .illusions/history/index.json.
 * 履歴インデックスの構造体。
 */
interface HistoryIndex {
  snapshots: string[];
  maxSnapshots: number;
  retentionDays: number;
}

/**
 * Result of project structure validation.
 * プロジェクト構造の検証結果。
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a project name for filesystem safety.
 * プロジェクト名がファイルシステムで安全かどうかを検証する。
 */
export function validateProjectName(name: string): { valid: boolean; error?: string } {
  if (!name.trim()) {
    return { valid: false, error: "プロジェクト名を入力してください" };
  }
  if (name.length > 200) {
    return { valid: false, error: "プロジェクト名が長すぎます" };
  }
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) {
    return {
      valid: false,
      error: '使用できない文字が含まれています: < > : " / \\ | ? *',
    };
  }
  if (/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i.test(name)) {
    return { valid: false, error: "予約語は使用できません" };
  }
  if (/^[\s.]+$/.test(name)) {
    return {
      valid: false,
      error: "空白やドットのみの名前は使用できません",
    };
  }
  return { valid: true };
}

export class ProjectService {
  private vfs: VirtualFileSystem;
  private projectManager: ProjectManager;
  /**
   * Per-file EOL cache: key is filePath (Electron) or fileName (Web).
   * Populated by openStandaloneFile; consumed by writeStandaloneTxtContent.
   */
  private fileEolCache = new Map<string, "lf" | "crlf">();

  /**
   * Decoded text cache: populated by openStandaloneFile so readStandaloneContent
   * can return already-decoded (BOM-stripped, LF-normalized) content.
   * Cleared after first read to avoid unbounded growth.
   */
  private fileContentCache = new Map<string, string>();

  constructor() {
    this.vfs = getProjectFileService();
    this.projectManager = getProjectManager();
  }

  /**
   * Create a new project in a user-selected directory.
   * ユーザーが選択したディレクトリに新規プロジェクトを作成する。
   *
   * @param name - Project name
   * @param fileExtension - Main file extension (defaults to .mdi)
   * @returns ProjectMode representing the created project
   */
  async createProject(
    name: string,
    fileExtension: SupportedFileExtension = ".mdi",
  ): Promise<ProjectMode> {
    // Validate project name before proceeding
    const validation = validateProjectName(name);
    if (!validation.valid) {
      throw new Error(validation.error ?? "無効なプロジェクト名です");
    }

    // 1. Open parent directory picker via VFS
    const parentDirHandle = await this.vfs.openDirectory();

    // 2. Create project directory with the project name
    const projectDirHandle = await parentDirHandle.getDirectoryHandle(name, {
      create: true,
    });

    // 3. Generate project ID and main file name
    const projectId = crypto.randomUUID();
    const mainFileName = `${name}${fileExtension}`;

    // 4. Create .illusions/ directory inside project directory
    const illusionsDir = await projectDirHandle.getDirectoryHandle(".illusions", {
      create: true,
    });

    // 5. Create project.json
    const metadata: ProjectConfig = {
      version: "1.0.0",
      projectId,
      name,
      mainFile: mainFileName,
      mainFileExtension: fileExtension,
      createdAt: Date.now(),
      lastModified: Date.now(),
      editorSettings: getDefaultEditorSettings(fileExtension),
    };
    const projectJsonHandle = await illusionsDir.getFileHandle("project.json", { create: true });
    await projectJsonHandle.write(JSON.stringify(metadata, null, 2));

    // 6. Create main file with initial content in project directory
    const mainFileHandle = await projectDirHandle.getFileHandle(mainFileName, {
      create: true,
    });
    await mainFileHandle.write(this.getInitialContent(fileExtension));

    // 7. Create workspace.json
    const workspaceState = getDefaultWorkspaceState();
    const workspaceJsonHandle = await illusionsDir.getFileHandle("workspace.json", {
      create: true,
    });
    await workspaceJsonHandle.write(JSON.stringify(workspaceState, null, 2));

    // 8. Create history/ directory with empty index
    const historyDir = await illusionsDir.getDirectoryHandle("history", {
      create: true,
    });
    const historyIndex: HistoryIndex = {
      snapshots: [],
      maxSnapshots: 100,
      retentionDays: 90,
    };
    const historyIndexHandle = await historyDir.getFileHandle("index.json", {
      create: true,
    });
    await historyIndexHandle.write(JSON.stringify(historyIndex, null, 2));

    // 9. Extract native handles for IndexedDB persistence and ProjectMode.
    // VFS wrappers cannot be stored in IndexedDB (Structured Clone loses class methods).
    // VFS ラッパーは Structured Clone でメソッドが失われるため、ネイティブハンドルを使用する。
    const nativeRootHandle =
      projectDirHandle.nativeDirectoryHandle ??
      (projectDirHandle as unknown as FileSystemDirectoryHandle);
    const nativeMainFileHandle =
      mainFileHandle.nativeFileHandle ?? (mainFileHandle as unknown as FileSystemFileHandle);

    // Save native handle to IndexedDB for persistence (Web only)
    if (!isElectronRenderer()) {
      try {
        await this.projectManager.saveProjectHandle(projectId, nativeRootHandle, name);
      } catch (error) {
        // IndexedDB may not be available in all contexts
        console.warn("プロジェクトハンドルの永続化をスキップしました:", error);
      }
    }

    // Compute the correct project root path (parent + project name).
    // After openDirectory(), VFS root points to the parent directory.
    // Update it to the project directory for subsequent operations.
    let projectRootPath: string | undefined;
    if (isElectronRenderer()) {
      const parentPath = this.vfs.getRootPath?.();
      if (parentPath) {
        projectRootPath = `${parentPath}/${name}`;
        if ("setRootPath" in this.vfs) {
          // #1476: rehydration — pass projectId for project-scoped approval persistence
          await (
            this.vfs as { setRootPath: (p: string, projectId?: string) => Promise<void> }
          ).setRootPath(projectRootPath, projectId);
        }
      }
    }

    return {
      type: "project",
      projectId,
      name,
      rootHandle: nativeRootHandle,
      mainFileHandle: nativeMainFileHandle,
      metadata,
      workspaceState,
      rootPath: projectRootPath,
    };
  }

  /**
   * Open an existing project from a user-selected directory.
   * ユーザーが選択したディレクトリから既存プロジェクトを開く。
   *
   * @returns ProjectMode representing the opened project
   * @throws Error if the directory does not contain a valid project structure
   */
  async openProject(): Promise<ProjectMode> {
    const rootDirHandle = await this.vfs.openDirectory();

    // Auto-repair missing/corrupt .illusions metadata so any selected folder
    // containing a manuscript opens as a project instead of failing. User
    // content is never created — only the .illusions management files.
    const { metadata, repaired } = await ensureProjectFiles(rootDirHandle);
    if (repaired) {
      notificationManager.info("プロジェクト設定ファイルが見つからなかったため復元しました。");
    }

    // Read workspace.json (ensureProjectFiles guarantees it exists; default-safe)
    let workspaceState: WorkspaceState;
    try {
      const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions", { create: false });
      const workspaceJsonHandle = await illusionsDir.getFileHandle("workspace.json");
      const workspaceText = await workspaceJsonHandle.read();
      workspaceState = JSON.parse(workspaceText) as WorkspaceState;
    } catch {
      workspaceState = getDefaultWorkspaceState();
    }

    // Get main file handle
    const mainFileHandle = await rootDirHandle.getFileHandle(metadata.mainFile);

    // Extract native handles (see createProject comment for rationale)
    const nativeRootHandle =
      rootDirHandle.nativeDirectoryHandle ??
      (rootDirHandle as unknown as FileSystemDirectoryHandle);
    const nativeMainFileHandle =
      mainFileHandle.nativeFileHandle ?? (mainFileHandle as unknown as FileSystemFileHandle);

    // Save native handle to IndexedDB (Web only)
    if (!isElectronRenderer()) {
      try {
        await this.projectManager.saveProjectHandle(
          metadata.projectId,
          nativeRootHandle,
          metadata.name,
        );
      } catch (error) {
        console.warn("プロジェクトハンドルの永続化をスキップしました:", error);
      }
    }

    return {
      type: "project",
      projectId: metadata.projectId,
      name: metadata.name,
      rootHandle: nativeRootHandle,
      mainFileHandle: nativeMainFileHandle,
      metadata,
      workspaceState,
      rootPath: isElectronRenderer() ? (this.vfs.getRootPath?.() ?? undefined) : undefined,
    };
  }

  /**
   * Save project content and update metadata.
   * プロジェクトのコンテンツを保存し、メタデータを更新する。
   *
   * @param project - The project to save
   * @param content - The main file content to write
   */
  async saveProject(project: ProjectMode, content: string): Promise<void> {
    const rootDirHandle = await this.getVFSDirectoryHandle(project);

    // Write main file
    const mainFileHandle = await rootDirHandle.getFileHandle(project.metadata.mainFile);
    await mainFileHandle.write(content);

    // Update project.json lastModified
    const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions", { create: true });
    const projectJsonHandle = await illusionsDir.getFileHandle("project.json", { create: true });
    const updatedMetadata: ProjectConfig = {
      ...project.metadata,
      lastModified: Date.now(),
    };
    await projectJsonHandle.write(JSON.stringify(updatedMetadata, null, 2));

    // Update workspace.json via merge writer (preserves openTabs/dockviewLayout
    // written by tab persistence — see workspace-persistence.ts).
    const { persistWorkspaceJson } = await import("./workspace-persistence");
    await persistWorkspaceJson({
      editorState: project.workspaceState.editorState,
      lastOpenedAt: project.workspaceState.lastOpenedAt,
      viewState: project.workspaceState.viewState,
    });
  }

  /**
   * Save only the project metadata (project.json) without touching the main file.
   * メインファイルを変更せずに、プロジェクトメタデータ（project.json）だけを保存する。
   *
   * @param project - The project whose metadata should be persisted
   */
  async saveProjectMetadata(project: ProjectMode): Promise<void> {
    const rootDirHandle = await this.getVFSDirectoryHandle(project);
    const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions", { create: true });
    const projectJsonHandle = await illusionsDir.getFileHandle("project.json", { create: true });
    await projectJsonHandle.write(JSON.stringify(project.metadata, null, 2));
  }

  /**
   * Open a single file in standalone mode.
   * 単一ファイルをスタンドアロンモードで開く。
   *
   * Uses the File System Access API file picker on Web,
   * or delegates to the Electron file dialog.
   *
   * @returns StandaloneMode representing the opened file
   * @throws Error if file picker is not supported
   */
  async openStandaloneFile(): Promise<StandaloneMode> {
    const vfsWithOpenFile = this.vfs as unknown as {
      openFile?: (opts?: { fileTypes?: string[] }) => Promise<{
        path: string;
        name: string;
        buf: Uint8Array;
      } | null>;
    };

    if (typeof vfsWithOpenFile.openFile !== "function") {
      throw new Error("ファイルを開く機能がこの環境でサポートされていません。");
    }

    const result = await vfsWithOpenFile.openFile({ fileTypes: ["txt"] });
    if (!result) {
      // User cancelled
      throw new Error("ファイルの選択がキャンセルされました。");
    }

    // Decode bytes: reject non-UTF-8 BOMs, strip UTF-8 BOM, detect EOL
    const { text, eol } = readTextWithEncoding(new Uint8Array(result.buf));

    // Cache EOL for write-back
    const cacheKey = result.path ?? result.name;
    this.fileEolCache.set(cacheKey, eol);

    const fileExtension = this.getFileExtension(result.name);
    const editorSettings = getDefaultEditorSettings(fileExtension);

    const standalone: StandaloneMode = {
      type: "standalone",
      fileHandle: null,
      fileName: result.name,
      fileExtension,
      editorSettings,
      filePath: result.path !== result.name ? result.path : undefined,
    };

    // Store decoded text so readStandaloneContent can return it immediately.
    // We key by cacheKey to avoid re-reading the file.
    this.fileContentCache.set(cacheKey, text);

    return standalone;
  }

  /**
   * Validate that a directory has a valid project structure.
   * ディレクトリが有効なプロジェクト構造を持つか検証する。
   *
   * @param rootDirHandle - Directory handle to validate
   * @returns Validation result with list of errors
   */
  async validateProjectStructure(rootDirHandle: VFSDirectoryHandle): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check .illusions directory existence by scanning the root entries.
    // On Electron, getDirectoryHandle(name, { create: false }) never throws for
    // a missing directory (it just wraps the path — see electron-vfs.ts), so a
    // real existence check is required to report the error accurately on both
    // platforms (#1567 item 15).
    // Electron の getDirectoryHandle は存在しないディレクトリでも throw しない
    // ため、entries() の走査で .illusions の実在を確認する。
    let illusionsDirExists = false;
    let entriesScanFailed = false;
    try {
      for await (const [name, entry] of rootDirHandle.entries()) {
        if (name === ".illusions" && entry.kind === "directory") {
          illusionsDirExists = true;
          break;
        }
      }
    } catch {
      // Root unreadable (permission loss, transient I/O): existence is UNKNOWN.
      // Do not conclude absence here — fall through to the handle probe so a
      // read failure is not misreported as a missing directory.
      entriesScanFailed = true;
    }
    if (!illusionsDirExists && !entriesScanFailed) {
      errors.push(".illusions directory not found");
      return { valid: false, errors };
    }

    // Obtain the handle (Web may still throw natively, e.g. permission loss)
    let illusionsDir: VFSDirectoryHandle | null = null;
    try {
      illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions", { create: false });
    } catch {
      errors.push(
        entriesScanFailed
          ? ".illusions directory is not accessible"
          : ".illusions directory not found",
      );
      return { valid: false, errors };
    }

    // Check project.json
    try {
      const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
      const content = await projectJsonHandle.read();
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // Validate required fields
      if (!parsed["version"]) {
        errors.push("project.json is missing 'version' field");
      }
      if (!parsed["projectId"]) {
        errors.push("project.json is missing 'projectId' field");
      }
      if (!parsed["name"]) {
        errors.push("project.json is missing 'name' field");
      }
      if (!parsed["mainFile"]) {
        errors.push("project.json is missing 'mainFile' field");
      }
    } catch {
      errors.push(".illusions/project.json not found or invalid");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Read the main file content of a project.
   * プロジェクトのメインファイルの内容を読み込む。
   *
   * @param project - The project to read from
   * @returns The main file content as text
   */
  async readProjectContent(project: ProjectMode): Promise<string> {
    const rootDirHandle = await this.getVFSDirectoryHandle(project);
    const mainFileHandle = await rootDirHandle.getFileHandle(project.metadata.mainFile);
    return mainFileHandle.read();
  }

  /**
   * Read file content for a standalone mode file.
   * スタンドアロンモードのファイル内容を読み込む。
   *
   * On Electron, reads via VFS using the absolute file path.
   * On Web, reads from the FileSystemFileHandle.
   *
   * @param standalone - The standalone mode object returned by openStandaloneFile
   * @returns The file content as text
   */
  async readStandaloneContent(standalone: StandaloneMode): Promise<string> {
    const cacheKey = standalone.filePath ?? standalone.fileName;

    // Return cached decoded content from openStandaloneFile (BOM-stripped, LF-normalized)
    const cached = this.fileContentCache.get(cacheKey);
    if (cached !== undefined) {
      this.fileContentCache.delete(cacheKey);
      return cached;
    }

    // .txt files: decode bytes through text-codec for BOM and EOL handling
    if (standalone.fileExtension === ".txt") {
      if (isElectronRenderer() && standalone.filePath) {
        // Read raw bytes via Electron IPC read-file endpoint
        const bridge = (
          window.electronAPI as unknown as {
            vfs?: { readFileRaw?: (p: string) => Promise<Uint8Array> };
          }
        )?.vfs;
        if (bridge?.readFileRaw) {
          const buf = await bridge.readFileRaw(standalone.filePath);
          const { text, eol } = readTextWithEncoding(new Uint8Array(buf));
          this.fileEolCache.set(cacheKey, eol);
          return text;
        }
        // Fallback: use standard readFile (UTF-8 string path, no BOM stripping)
        const vfs = getProjectFileService();
        return vfs.readFile(standalone.filePath);
      }

      if (standalone.fileHandle) {
        const file = await standalone.fileHandle.getFile();
        const arrayBuf = await file.arrayBuffer();
        const { text, eol } = readTextWithEncoding(new Uint8Array(arrayBuf));
        this.fileEolCache.set(cacheKey, eol);
        return text;
      }
    }

    if (isElectronRenderer() && standalone.filePath) {
      const vfs = getProjectFileService();
      return vfs.readFile(standalone.filePath);
    }

    if (standalone.fileHandle) {
      const file = await standalone.fileHandle.getFile();
      return file.text();
    }

    throw new Error("ファイルの内容を読み込めませんでした。");
  }

  /**
   * Get the EOL style detected for a standalone .txt file.
   * Returns "lf" as default if no EOL was recorded.
   *
   * @param standalone - The standalone mode object
   * @returns "lf" or "crlf"
   */
  getStandaloneTxtEol(standalone: StandaloneMode): "lf" | "crlf" {
    const cacheKey = standalone.filePath ?? standalone.fileName;
    return this.fileEolCache.get(cacheKey) ?? "lf";
  }

  /**
   * Get default initial content for a new file based on its extension.
   * 新規ファイルのデフォルト初期コンテンツを取得する。
   */
  private getInitialContent(fileExtension: SupportedFileExtension): string {
    switch (fileExtension) {
      case ".mdi":
        return "# 新しい物語\n\nここから書き始めてください。\n\n{漢字|かんじ}のルビや^縦中横^も使えます。\n";
      case ".md":
        return "# 新しいドキュメント\n\nMarkdown形式で書き始めてください。\n";
      case ".txt":
        return "新しいテキストファイル\n\nここから書き始めてください。\n";
    }
  }

  /**
   * Extract the file extension from a filename as a SupportedFileExtension.
   * ファイル名からサポートされた拡張子を抽出する。
   */
  private getFileExtension(fileName: string): SupportedFileExtension {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".mdi")) return ".mdi";
    if (lower.endsWith(".md")) return ".md";
    return ".txt";
  }

  /**
   * Get a VFSDirectoryHandle for a project's root directory.
   * Bridges between ProjectMode's native FileSystemDirectoryHandle and VFS.
   *
   * プロジェクトのルートディレクトリの VFSDirectoryHandle を取得する。
   * ProjectMode のネイティブハンドルと VFS の間を橋渡しする。
   */
  private async getVFSDirectoryHandle(project: ProjectMode): Promise<VFSDirectoryHandle> {
    // If VFS already has root set, use it directly.
    if (this.vfs.isRootOpen()) {
      return await this.vfs.getDirectoryHandle("");
    }

    // Electron: recover from stored rootPath after page reload
    if (isElectronRenderer() && project.rootPath) {
      // Re-set the VFS root using the stored absolute path
      if ("setRootPath" in this.vfs) {
        // #1476: rehydration — pass projectId so the approval is looked up project-scoped
        await (
          this.vfs as { setRootPath: (p: string, projectId?: string) => Promise<void> }
        ).setRootPath(project.rootPath, project.projectId);
      }
      return await this.vfs.getDirectoryHandle("");
    }

    // Web: recover from project's rootHandle (restored from IndexedDB)
    if (project.rootHandle && "setRootHandle" in this.vfs) {
      (this.vfs as { setRootHandle: (h: FileSystemDirectoryHandle) => void }).setRootHandle(
        project.rootHandle,
      );
      return await this.vfs.getDirectoryHandle("");
    }

    throw new Error("VFS のルートディレクトリが利用できません。プロジェクトを再度開いてください。");
  }
}

/**
 * Singleton instance of ProjectService.
 */
let projectServiceInstance: ProjectService | null = null;

/**
 * Get the singleton ProjectService instance.
 * ProjectService のシングルトンインスタンスを取得する。
 */
export function getProjectService(): ProjectService {
  if (!projectServiceInstance) {
    projectServiceInstance = new ProjectService();
  }
  return projectServiceInstance;
}
