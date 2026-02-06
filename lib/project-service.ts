/**
 * Project CRUD service.
 * Handles creating, opening, saving, and managing projects.
 *
 * プロジェクトの作成・開閉・保存を管理するサービス。
 */

import { getVFS } from "./vfs";
import { getProjectManager } from "./project-manager";
import { isElectronRenderer } from "./runtime-env";
import {
  getDefaultEditorSettings,
  getDefaultWorkspaceState,
} from "./project-types";

import type { VirtualFileSystem, VFSDirectoryHandle } from "./vfs/types";
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
 * Options for the file open picker dialog (Web).
 */
interface FilePickerOptions {
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
  multiple: boolean;
}

/**
 * Window interface with showOpenFilePicker for type-safe access.
 */
interface WindowWithFilePicker {
  showOpenFilePicker: (options: FilePickerOptions) => Promise<FileSystemFileHandle[]>;
}

/**
 * Type guard for showOpenFilePicker support.
 */
function hasShowOpenFilePicker(
  w: Window
): w is Window & WindowWithFilePicker {
  return "showOpenFilePicker" in w;
}

export class ProjectService {
  private vfs: VirtualFileSystem;
  private projectManager: ProjectManager;

  constructor() {
    this.vfs = getVFS();
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
    fileExtension: SupportedFileExtension = ".mdi"
  ): Promise<ProjectMode> {
    // 1. Open directory picker via VFS
    const rootDirHandle = await this.vfs.openDirectory();

    // 2. Generate project ID
    const projectId = crypto.randomUUID();
    const mainFileName = `${name}${fileExtension}`;

    // 3. Create .illusions/ directory
    const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions", {
      create: true,
    });

    // 4. Create project.json
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
    const projectJsonHandle = await illusionsDir.getFileHandle(
      "project.json",
      { create: true }
    );
    await projectJsonHandle.write(JSON.stringify(metadata, null, 2));

    // 5. Create main file with initial content
    const mainFileHandle = await rootDirHandle.getFileHandle(mainFileName, {
      create: true,
    });
    await mainFileHandle.write(this.getInitialContent(fileExtension));

    // 6. Create workspace.json
    const workspaceState = getDefaultWorkspaceState();
    const workspaceJsonHandle = await illusionsDir.getFileHandle(
      "workspace.json",
      { create: true }
    );
    await workspaceJsonHandle.write(
      JSON.stringify(workspaceState, null, 2)
    );

    // 7. Create history/ directory with empty index
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
    await historyIndexHandle.write(
      JSON.stringify(historyIndex, null, 2)
    );

    // 8. Create .gitignore
    const gitignoreHandle = await rootDirHandle.getFileHandle(".gitignore", {
      create: true,
    });
    await gitignoreHandle.write(this.getGitignoreContent());

    // 9. Extract native handles for IndexedDB persistence and ProjectMode.
    // VFS wrappers cannot be stored in IndexedDB (Structured Clone loses class methods).
    // VFS ラッパーは Structured Clone でメソッドが失われるため、ネイティブハンドルを使用する。
    const nativeRootHandle = rootDirHandle.nativeDirectoryHandle
      ?? (rootDirHandle as unknown as FileSystemDirectoryHandle);
    const nativeMainFileHandle = mainFileHandle.nativeFileHandle
      ?? (mainFileHandle as unknown as FileSystemFileHandle);

    // Save native handle to IndexedDB for persistence (Web only)
    if (!isElectronRenderer()) {
      try {
        await this.projectManager.saveProjectHandle(
          projectId,
          nativeRootHandle,
          name
        );
      } catch (error) {
        // IndexedDB may not be available in all contexts
        console.warn(
          "プロジェクトハンドルの永続化をスキップしました:",
          error
        );
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

    // Read .illusions/project.json
    const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions");
    const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
    const metadataText = await projectJsonHandle.read();
    const metadata: ProjectConfig = JSON.parse(metadataText) as ProjectConfig;

    // Read workspace.json (create defaults if missing)
    let workspaceState: WorkspaceState;
    try {
      const workspaceJsonHandle = await illusionsDir.getFileHandle(
        "workspace.json"
      );
      const workspaceText = await workspaceJsonHandle.read();
      workspaceState = JSON.parse(workspaceText) as WorkspaceState;
    } catch {
      // workspace.json may not exist in older projects
      workspaceState = getDefaultWorkspaceState();
    }

    // Get main file handle
    const mainFileHandle = await rootDirHandle.getFileHandle(
      metadata.mainFile
    );

    // Extract native handles (see createProject comment for rationale)
    const nativeRootHandle = rootDirHandle.nativeDirectoryHandle
      ?? (rootDirHandle as unknown as FileSystemDirectoryHandle);
    const nativeMainFileHandle = mainFileHandle.nativeFileHandle
      ?? (mainFileHandle as unknown as FileSystemFileHandle);

    // Save native handle to IndexedDB (Web only)
    if (!isElectronRenderer()) {
      try {
        await this.projectManager.saveProjectHandle(
          metadata.projectId,
          nativeRootHandle,
          metadata.name
        );
      } catch (error) {
        console.warn(
          "プロジェクトハンドルの永続化をスキップしました:",
          error
        );
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
    const mainFileHandle = await rootDirHandle.getFileHandle(
      project.metadata.mainFile
    );
    await mainFileHandle.write(content);

    // Update project.json lastModified
    const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions");
    const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
    const updatedMetadata: ProjectConfig = {
      ...project.metadata,
      lastModified: Date.now(),
    };
    await projectJsonHandle.write(
      JSON.stringify(updatedMetadata, null, 2)
    );

    // Update workspace.json
    const workspaceJsonHandle = await illusionsDir.getFileHandle(
      "workspace.json"
    );
    await workspaceJsonHandle.write(
      JSON.stringify(project.workspaceState, null, 2)
    );
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
    // For Electron, delegate to the Electron file dialog via electronAPI
    if (isElectronRenderer() && window.electronAPI) {
      const result = await window.electronAPI.openFile();
      if (!result) {
        throw new Error("ファイル選択がキャンセルされました。");
      }

      const fileName = result.path.split("/").pop() ?? result.path;
      const fileExtension = this.getFileExtension(fileName);

      // Electron does not have FileSystemFileHandle, so we create a minimal shim.
      // The caller should use VFS readFile/writeFile for actual I/O in Electron.
      // Here we return a dummy handle since ProjectMode/StandaloneMode require it.
      return {
        type: "standalone",
        fileHandle: null as unknown as FileSystemFileHandle,
        fileName,
        fileExtension,
        editorSettings: getDefaultEditorSettings(fileExtension),
      };
    }

    // Web: use File System Access API showOpenFilePicker
    if (typeof window !== "undefined" && hasShowOpenFilePicker(window)) {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "テキストファイル",
            accept: {
              "text/plain": [".txt"],
              "text/markdown": [".md"],
              "text/x-mdi": [".mdi"],
            },
          },
        ],
        multiple: false,
      });

      const fileExtension = this.getFileExtension(fileHandle.name);

      return {
        type: "standalone",
        fileHandle,
        fileName: fileHandle.name,
        fileExtension,
        editorSettings: getDefaultEditorSettings(fileExtension),
      };
    }

    throw new Error(
      "ファイル選択ダイアログはこの環境でサポートされていません。"
    );
  }

  /**
   * Validate that a directory has a valid project structure.
   * ディレクトリが有効なプロジェクト構造を持つか検証する。
   *
   * @param rootDirHandle - Directory handle to validate
   * @returns Validation result with list of errors
   */
  async validateProjectStructure(
    rootDirHandle: VFSDirectoryHandle
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check .illusions directory
    let illusionsDir: VFSDirectoryHandle | null = null;
    try {
      illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions");
    } catch {
      errors.push(".illusions directory not found");
      return { valid: false, errors };
    }

    // Check project.json
    try {
      const projectJsonHandle = await illusionsDir.getFileHandle(
        "project.json"
      );
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
    const mainFileHandle = await rootDirHandle.getFileHandle(
      project.metadata.mainFile
    );
    return mainFileHandle.read();
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
   * Generate .gitignore content for Illusions projects.
   * .gitignore ファイルの内容を生成する。
   */
  private getGitignoreContent(): string {
    return `# Illusions project settings
.illusions/
*.history

# Editor backups
*.bak
*.tmp
`;
  }

  /**
   * Extract the file extension from a filename as a SupportedFileExtension.
   * ファイル名からサポートされた拡張子を抽出する。
   */
  private getFileExtension(fileName: string): SupportedFileExtension {
    if (fileName.endsWith(".mdi")) return ".mdi";
    if (fileName.endsWith(".md")) return ".md";
    return ".txt";
  }

  /**
   * Get a VFSDirectoryHandle for a project's root directory.
   * Bridges between ProjectMode's native FileSystemDirectoryHandle and VFS.
   *
   * プロジェクトのルートディレクトリの VFSDirectoryHandle を取得する。
   * ProjectMode のネイティブハンドルと VFS の間を橋渡しする。
   */
  private async getVFSDirectoryHandle(
    _project: ProjectMode
  ): Promise<VFSDirectoryHandle> {
    // The VFS stores the root handle after openDirectory() was called.
    // We retrieve it by getting the directory handle for the empty path (root).
    try {
      return await this.vfs.getDirectoryHandle("");
    } catch {
      // If VFS doesn't have root set (e.g., after page reload),
      // the caller needs to re-open the project via openProject().
      throw new Error(
        "VFS のルートディレクトリが利用できません。プロジェクトを再度開いてください。"
      );
    }
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
