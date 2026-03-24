import { useCallback, useRef, useState } from "react";

import { getStorageService } from "@/lib/storage/storage-service";
import { getProjectService } from "@/lib/project/project-service";
import { getProjectUpgradeService } from "@/lib/project/project-upgrade";
import { isStandaloneMode, getDefaultWorkspaceState } from "@/lib/project/project-types";
import { getVFS } from "@/lib/vfs";
import { notificationManager } from "@/lib/services/notification-manager";

import type { EditorMode, ProjectMode, StandaloneMode } from "@/lib/project/project-types";
import { ensureProjectJson, readFileHandle } from "./project-file-utils";
import { useUpgradeBanner } from "./use-upgrade-banner";
import { useRecentProjects } from "./use-recent-projects";
import { useAutoRestore } from "./use-auto-restore";
import { usePermissions } from "./use-permissions";

export type { RecentProjectEntry } from "./types";

interface UseProjectLifecycleParams {
  editorMode: EditorMode;
  setProjectMode: (project: ProjectMode) => void;
  setStandaloneMode: (standalone: StandaloneMode) => void;
  isElectron: boolean;
  /** Load a file into the tab manager by path and content */
  tabLoadSystemFile: (path: string, content: string) => void;
  /** Increment editor key to force editor remount */
  incrementEditorKey: () => void;
  /** Current editor content (needed for upgrade and upgrade-banner triggers) */
  content: string;
  /** Whether to skip auto-restore (e.g. ?welcome parameter) */
  skipAutoRestore: boolean;
  /** Last saved timestamp from tab manager (needed for upgrade-banner triggers) */
  lastSavedTime: number | null;
  /** Called once after the VFS root has been set (or when no project to restore) */
  onVfsReady?: () => void;
}

export interface ProjectLifecycleState {
  recentProjects: import("./types").RecentProjectEntry[];
  showCreateWizard: boolean;
  showPermissionPrompt: boolean;
  permissionPromptData: import("./types").PermissionPromptState | null;
  isRestoring: boolean;
  restoreError: string | null;
  confirmRemoveRecent: { projectId: string; message: string } | null;
}

export interface ProjectLifecycleHandlers {
  handleCreateProject: () => void;
  handleOpenProject: () => Promise<void>;
  handleOpenStandaloneFile: () => Promise<void>;
  handleOpenRecentProject: (projectId: string) => Promise<void>;
  handleDeleteRecentProject: (projectId: string) => Promise<void>;
  handleOpenAsProject: (projectPath: string, initialFile: string) => Promise<void>;
  handleProjectCreated: (project: ProjectMode) => Promise<void>;
  handlePermissionGranted: () => void;
  handlePermissionDenied: () => void;
  handleUpgrade: () => Promise<void>;
  handleUpgradeDismiss: () => void;
  setShowCreateWizard: (value: boolean) => void;
  setRestoreError: (value: string | null) => void;
  setConfirmRemoveRecent: (value: { projectId: string; message: string } | null) => void;
}

export interface ProjectLifecycleUpgrade {
  showUpgradeBanner: boolean;
  upgradeBannerDismissed: boolean;
}

export interface UseProjectLifecycleResult {
  state: ProjectLifecycleState;
  handlers: ProjectLifecycleHandlers;
  upgrade: ProjectLifecycleUpgrade;
}

/**
 * Manages the full project lifecycle: loading recent projects,
 * auto-restoring, creating/opening/upgrading projects, and
 * handling permission prompts.
 *
 * Delegates to:
 * - {@link useUpgradeBanner} for upgrade banner state
 * - {@link useRecentProjects} for recent project list management
 * - {@link useAutoRestore} for startup session restore
 * - {@link usePermissions} for permission prompt state and handlers
 * - {@link ensureProjectJson} / {@link readFileHandle} for file I/O helpers
 */
export function useProjectLifecycle(params: UseProjectLifecycleParams): UseProjectLifecycleResult {
  const {
    editorMode,
    setProjectMode,
    setStandaloneMode,
    isElectron,
    tabLoadSystemFile,
    incrementEditorKey,
    content,
    skipAutoRestore,
    lastSavedTime,
    onVfsReady,
  } = params;

  // UI state
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const isAutoRestoringRef = useRef(false);
  const [confirmRemoveRecent, setConfirmRemoveRecent] = useState<{ projectId: string; message: string } | null>(null);

  // VFS readiness signal: ensures onVfsReady is called exactly once
  const vfsReadyFiredRef = useRef(false);
  const onVfsReadyRef = useRef(onVfsReady);
  onVfsReadyRef.current = onVfsReady;

  const signalVfsReady = useCallback(() => {
    if (vfsReadyFiredRef.current) return;
    vfsReadyFiredRef.current = true;
    onVfsReadyRef.current?.();
  }, []);

  // Upgrade banner
  const { showUpgradeBanner, upgradeBannerDismissed, handleUpgradeDismiss } = useUpgradeBanner(
    editorMode,
    content,
    lastSavedTime,
  );

  // Recent projects + auto-restore trigger
  const onNoRestore = useCallback(() => {
    setIsRestoring(false);
    signalVfsReady();
  }, [signalVfsReady]);

  const { recentProjects, autoRestoreProjectId, handleDeleteRecentProject } = useRecentProjects(
    isElectron,
    skipAutoRestore,
    onNoRestore,
  );

  // --- Internal helpers ---

  /** Load a project's main file content into the editor */
  const loadProjectContent = useCallback(async (project: ProjectMode) => {
    try {
      const projectService = getProjectService();
      const mainContent = await projectService.readProjectContent(project);
      const mainFileName = project.metadata.mainFile;

      if (isElectron && project.rootPath) {
        tabLoadSystemFile(`${project.rootPath}/${mainFileName}`, mainContent);
      } else {
        tabLoadSystemFile(mainFileName, mainContent);
      }

      incrementEditorKey();
    } catch (error) {
      console.error("Failed to load project main file:", error);
      notificationManager.error(
        "プロジェクトのメインファイルを読み込めませんでした。ファイルが移動または削除された可能性があります。"
      );
    }
  }, [isElectron, tabLoadSystemFile, incrementEditorKey]);

  /** Read project.json from a restored directory handle and enter project mode */
  const openRestoredProject = useCallback(async (handle: FileSystemDirectoryHandle) => {
    try {
      const { metadata, illusionsDir } = await ensureProjectJson(handle);

      let workspaceState: ProjectMode["workspaceState"];
      try {
        const workspaceJsonHandle = await illusionsDir.getFileHandle("workspace.json");
        const workspaceText = await readFileHandle(workspaceJsonHandle as Parameters<typeof readFileHandle>[0]);
        workspaceState = JSON.parse(workspaceText) as ProjectMode["workspaceState"];
      } catch {
        workspaceState = getDefaultWorkspaceState();
      }

      const mainFileHandle = await handle.getFileHandle(metadata.mainFile);

      const project: ProjectMode = {
        type: "project",
        projectId: metadata.projectId,
        name: metadata.name,
        rootHandle: handle,
        mainFileHandle,
        metadata,
        workspaceState,
      };

      setProjectMode(project);
      // Skip loading main file during auto-restore on Electron — tab persistence
      // will restore the previously open tabs (or empty state).
      // On Web, always load so the main file is available.
      if (!isAutoRestoringRef.current || !isElectron) {
        await loadProjectContent(project);
      }
    } catch (error) {
      console.error("Failed to load restored project:", error);
    }
  }, [setProjectMode, loadProjectContent, isElectron]);

  // --- Handlers ---

  const handleCreateProject = useCallback(() => {
    setShowCreateWizard(true);
  }, []);

  const handleOpenProject = useCallback(async () => {
    try {
      const projectService = getProjectService();
      const project = await projectService.openProject();
      setProjectMode(project);
      await loadProjectContent(project);

      if (isElectron && project.rootPath) {
        const storage = getStorageService();
        await storage.addRecentProject({
          id: project.projectId,
          rootPath: project.rootPath,
          name: project.name,
        });
        void window.electronAPI?.rebuildMenu?.();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof Error && error.message.includes("cancelled")) return;
      console.error("Failed to open project:", error);
    }
  }, [setProjectMode, isElectron, loadProjectContent]);

  const handleOpenStandaloneFile = useCallback(async () => {
    try {
      const projectService = getProjectService();
      const standalone = await projectService.openStandaloneFile();
      setStandaloneMode(standalone);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to open file:", error);
    }
  }, [setStandaloneMode]);

  // Permission prompt state and handlers (usePermissions needs openRestoredProject,
  // so it must be declared after openRestoredProject)
  const {
    showPermissionPrompt,
    permissionPromptData,
    handlePermissionGranted,
    handlePermissionDenied,
    setShowPermissionPrompt,
    setPermissionPromptData,
  } = usePermissions(openRestoredProject);

  const handleOpenRecentProject = useCallback(async (projectId: string) => {
    try {
      if (isElectron) {
        const storage = getStorageService();
        const projects = await storage.getRecentProjects();
        const project = projects.find((p) => p.id === projectId);
        if (!project) {
          if (!isAutoRestoringRef.current) {
            notificationManager.error("このプロジェクトが見つかりませんでした。");
          }
          return;
        }

        try {
          const vfs = getVFS();
          if ("setRootPath" in vfs) {
            await (vfs as { setRootPath: (p: string) => Promise<void> }).setRootPath(project.rootPath);
          }
          signalVfsReady();
          const rootDirHandle = await vfs.getDirectoryHandle("");
          const { metadata, illusionsDir } = await ensureProjectJson(rootDirHandle);

          let workspaceState: ProjectMode["workspaceState"];
          try {
            const wsHandle = await illusionsDir.getFileHandle("workspace.json");
            const wsText = await readFileHandle(wsHandle as Parameters<typeof readFileHandle>[0]);
            workspaceState = JSON.parse(wsText) as ProjectMode["workspaceState"];
          } catch {
            workspaceState = getDefaultWorkspaceState();
          }

          const mainFileHandle = await rootDirHandle.getFileHandle(metadata.mainFile);
          const nativeMainFileHandle = mainFileHandle as unknown as FileSystemFileHandle;
          const nativeRootHandle = rootDirHandle as unknown as FileSystemDirectoryHandle;

          const restoredProject: ProjectMode = {
            type: "project",
            projectId: metadata.projectId,
            name: metadata.name,
            rootHandle: nativeRootHandle,
            mainFileHandle: nativeMainFileHandle,
            metadata,
            workspaceState,
            rootPath: project.rootPath,
          };

          setProjectMode(restoredProject);
          // Skip loading main file during auto-restore on Electron — tab persistence
          // will restore the previously open tabs (or empty state).
          // On Web, always load so the main file is available.
          if (!isAutoRestoringRef.current || !isElectron) {
            await loadProjectContent(restoredProject);
          }
        } catch (error) {
          signalVfsReady();
          console.error("Failed to load project:", error);
          console.error("Project path:", project.rootPath);

          const isFileNotFound = error && typeof error === "object" &&
            ("code" in error && (error as { code: string }).code === "ENOENT");

          const message = isFileNotFound
            ? `プロジェクトが見つかりませんでした。\n\nパス: ${project.rootPath}\n\nフォルダが移動または削除された可能性があります。\n最近のプロジェクト一覧から削除しますか?`
            : "このプロジェクトを開けませんでした。フォルダが移動または削除された可能性があります。";

          if (!isAutoRestoringRef.current) {
            if (isFileNotFound) {
              setConfirmRemoveRecent({ projectId, message });
            } else {
              notificationManager.error(message);
            }
          }
        }
        return;
      }

      // Web: restore from IndexedDB project handles
      const { getProjectManager } = await import("@/lib/project/project-manager");
      const projectManager = getProjectManager();
      const restoreResult = await projectManager.restoreProjectHandle(projectId);

      if (!restoreResult.success || !restoreResult.handle) {
        console.error("Failed to restore project handle:", restoreResult.error);
        if (!isAutoRestoringRef.current) {
          notificationManager.error("このプロジェクトを開けませんでした。「プロジェクトを開く」から再度選択してください。");
        }
        return;
      }

      if (restoreResult.permissionStatus.status === "prompt-required") {
        setPermissionPromptData({
          projectName: projectId,
          handle: restoreResult.handle,
          projectId,
        });
        setShowPermissionPrompt(true);
        return;
      }

      await openRestoredProject(restoreResult.handle);
    } catch (error) {
      console.error("Failed to open recent project:", error);
    }
  }, [isElectron, setProjectMode, openRestoredProject, loadProjectContent, signalVfsReady, setPermissionPromptData, setShowPermissionPrompt]);

  // Auto-restore the last opened project on startup
  useAutoRestore({
    autoRestoreProjectId,
    isElectron,
    isAutoRestoringRef,
    setIsRestoring,
    setRestoreError,
    signalVfsReady,
    handleOpenRecentProject,
  });

  const handleOpenAsProject = useCallback(async (projectPath: string, initialFile: string) => {
    try {
      const vfs = getVFS();
      if ("setRootPath" in vfs) {
        await (vfs as { setRootPath: (p: string) => Promise<void> }).setRootPath(projectPath);
      }

      const rootDirHandle = await vfs.getDirectoryHandle("");
      const { metadata, illusionsDir } = await ensureProjectJson(rootDirHandle, initialFile);

      let workspaceState: ProjectMode["workspaceState"];
      try {
        const wsHandle = await illusionsDir.getFileHandle("workspace.json");
        const wsText = await readFileHandle(wsHandle as Parameters<typeof readFileHandle>[0]);
        workspaceState = JSON.parse(wsText) as ProjectMode["workspaceState"];
      } catch {
        workspaceState = getDefaultWorkspaceState();
      }

      const initialFileHandle = await rootDirHandle.getFileHandle(initialFile);
      const nativeMainFileHandle = initialFileHandle as unknown as FileSystemFileHandle;
      const nativeRootHandle = rootDirHandle as unknown as FileSystemDirectoryHandle;

      const project: ProjectMode = {
        type: "project",
        projectId: metadata.projectId,
        name: metadata.name,
        rootHandle: nativeRootHandle,
        mainFileHandle: nativeMainFileHandle,
        metadata,
        workspaceState,
        rootPath: projectPath,
      };

      setProjectMode(project);
      await loadProjectContent(project);

      const storage = getStorageService();
      await storage.addRecentProject({
        id: project.projectId,
        rootPath: projectPath,
        name: project.name,
      });
      void window.electronAPI?.rebuildMenu?.();
    } catch (error) {
      console.error("[Open as Project] Failed to open project:", error);
      notificationManager.error("プロジェクトを開けませんでした。.illusionsフォルダが正しく設定されているか確認してください。");
    }
  }, [setProjectMode, loadProjectContent]);

  const handleProjectCreated = useCallback(async (project: ProjectMode) => {
    setProjectMode(project);
    setShowCreateWizard(false);
    await loadProjectContent(project);

    if (isElectron && project.rootPath) {
      const storage = getStorageService();
      await storage.addRecentProject({
        id: project.projectId,
        rootPath: project.rootPath,
        name: project.name,
      });
      void window.electronAPI?.rebuildMenu?.();
    }
  }, [setProjectMode, isElectron, loadProjectContent]);

  const handleUpgrade = useCallback(async () => {
    if (!isStandaloneMode(editorMode)) return;
    try {
      const upgradeService = getProjectUpgradeService();
      const project = await upgradeService.upgradeToProject(editorMode, content);
      setProjectMode(project);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to upgrade to project:", error);
    }
  }, [editorMode, content, setProjectMode]);

  return {
    state: {
      recentProjects,
      showCreateWizard,
      showPermissionPrompt,
      permissionPromptData,
      isRestoring,
      restoreError,
      confirmRemoveRecent,
    },
    handlers: {
      handleCreateProject,
      handleOpenProject,
      handleOpenStandaloneFile,
      handleOpenRecentProject,
      handleDeleteRecentProject,
      handleOpenAsProject,
      handleProjectCreated,
      handlePermissionGranted,
      handlePermissionDenied,
      handleUpgrade,
      handleUpgradeDismiss,
      setShowCreateWizard,
      setRestoreError,
      setConfirmRemoveRecent,
    },
    upgrade: {
      showUpgradeBanner,
      upgradeBannerDismissed,
    },
  };
}
