import { useCallback, useEffect, useRef, useState } from "react";

import ElectronStorageProvider from "@/lib/electron-storage";
import { getProjectManager } from "@/lib/project-manager";
import { getProjectService } from "@/lib/project-service";
import { getProjectUpgradeService } from "@/lib/project-upgrade";
import { isStandaloneMode } from "@/lib/project-types";
import { getVFS } from "@/lib/vfs";
import { notificationManager } from "@/lib/notification-manager";

import type { EditorMode, ProjectMode, StandaloneMode } from "@/lib/project-types";
import { chars } from "./types";
import type { RecentProjectEntry, PermissionPromptState } from "./types";

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
  recentProjects: RecentProjectEntry[];
  showCreateWizard: boolean;
  showPermissionPrompt: boolean;
  permissionPromptData: PermissionPromptState | null;
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

  // State
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([]);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [permissionPromptData, setPermissionPromptData] = useState<PermissionPromptState | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const isAutoRestoringRef = useRef(false);
  const [confirmRemoveRecent, setConfirmRemoveRecent] = useState<{ projectId: string; message: string } | null>(null);
  const [autoRestoreProjectId, setAutoRestoreProjectId] = useState<string | null>(null);

  // VFS readiness signal: ensures onVfsReady is called exactly once
  const vfsReadyFiredRef = useRef(false);
  const onVfsReadyRef = useRef(onVfsReady);
  onVfsReadyRef.current = onVfsReady;

  const signalVfsReady = useCallback(() => {
    if (vfsReadyFiredRef.current) return;
    vfsReadyFiredRef.current = true;
    onVfsReadyRef.current?.();
  }, []);

  // Upgrade banner state
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [upgradeBannerDismissed, setUpgradeBannerDismissed] = useState(false);
  const standaloneSaveCountRef = useRef(0);
  // Tracks whether we've seen a prior save (so we skip the initial load)
  const upgradeSaveInitializedRef = useRef(false);

  // Track save count to trigger UpgradeBanner in standalone mode
  useEffect(() => {
    if (!lastSavedTime) return;
    if (!upgradeSaveInitializedRef.current) {
      // First time seeing lastSavedTime; skip (this is initial load, not a user save)
      upgradeSaveInitializedRef.current = true;
      return;
    }
    if (!isStandaloneMode(editorMode) || upgradeBannerDismissed) return;

    standaloneSaveCountRef.current += 1;
    // Show banner on 1st save or subsequent saves
    if (standaloneSaveCountRef.current >= 1) {
      setShowUpgradeBanner(true);
    }
  }, [lastSavedTime, editorMode, upgradeBannerDismissed]);

  // Track character count to trigger UpgradeBanner at 5,000 characters
  useEffect(() => {
    if (!isStandaloneMode(editorMode) || upgradeBannerDismissed) return;
    if (chars(content) >= 5000) {
      setShowUpgradeBanner(true);
    }
  }, [content, editorMode, upgradeBannerDismissed]);

  // Reset save count tracking when editor mode changes
  useEffect(() => {
    standaloneSaveCountRef.current = 0;
  }, [editorMode]);

  // --- Internal helpers ---

  /** Load a project's main file content into the editor */
  const loadProjectContent = useCallback(async (project: ProjectMode) => {
    try {
      const projectService = getProjectService();
      const mainContent = await projectService.readProjectContent(project);
      const mainFileName = project.metadata.mainFile;

      if (isElectron && project.rootPath) {
        tabLoadSystemFile(
          `${project.rootPath}/${mainFileName}`,
          mainContent
        );
      } else {
        tabLoadSystemFile(mainFileName, mainContent);
      }

      incrementEditorKey();
    } catch (error) {
      console.error(
        "Failed to load project main file:",
        error
      );
    }
  }, [isElectron, tabLoadSystemFile, incrementEditorKey]);

  /** Read project.json from a restored directory handle and enter project mode */
  const openRestoredProject = useCallback(async (handle: FileSystemDirectoryHandle) => {
    try {
      const illusionsDir = await handle.getDirectoryHandle(".illusions");
      const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
      const projectJsonFile = await projectJsonHandle.getFile();
      const metadataText = await projectJsonFile.text();
      const metadata = JSON.parse(metadataText) as ProjectMode["metadata"];

      // Read workspace.json (defaults if missing)
      let workspaceState: ProjectMode["workspaceState"];
      try {
        const workspaceJsonHandle = await illusionsDir.getFileHandle("workspace.json");
        const workspaceJsonFile = await workspaceJsonHandle.getFile();
        const workspaceText = await workspaceJsonFile.text();
        workspaceState = JSON.parse(workspaceText) as ProjectMode["workspaceState"];
      } catch {
        const { getDefaultWorkspaceState } = await import("@/lib/project-types");
        workspaceState = getDefaultWorkspaceState();
      }

      // Get main file handle
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
      await loadProjectContent(project);
    } catch (error) {
      console.error("Failed to load restored project:", error);
    }
  }, [setProjectMode, loadProjectContent]);

  // --- Load recent projects on mount ---
  useEffect(() => {
    let mounted = true;

    const loadRecentProjects = async () => {
      try {
        if (isElectron) {
          const storage = new ElectronStorageProvider();
          await storage.initialize();
          const projects = await storage.getRecentProjects();
          if (!mounted) return;

          const entries: RecentProjectEntry[] = projects.map((p) => ({
            projectId: p.id,
            name: p.name,
            lastAccessedAt: Date.now(),
            rootDirName: p.rootPath.split("/").pop(),
          }));
          setRecentProjects(entries);

          if (!skipAutoRestore && projects.length > 0) {
            setAutoRestoreProjectId(projects[0].id);
          } else {
            setIsRestoring(false);
            signalVfsReady();
          }
        } else {
          const projectManager = getProjectManager();
          const handles = await projectManager.listProjectHandles();
          if (!mounted) return;

          const entries: RecentProjectEntry[] = handles.map((h) => ({
            projectId: h.projectId,
            name: h.name ?? h.rootDirName ?? h.projectId,
            lastAccessedAt: h.lastAccessedAt,
            rootDirName: h.rootDirName,
          }));
          setRecentProjects(entries);

          if (!skipAutoRestore && handles.length > 0) {
            setAutoRestoreProjectId(handles[0].projectId);
          } else {
            setIsRestoring(false);
            signalVfsReady();
          }
        }
      } catch (error) {
        console.error("Failed to load recent projects:", error);
        setIsRestoring(false);
        signalVfsReady();
      }
    };

    void loadRecentProjects();

    return () => {
      mounted = false;
    };
  }, [isElectron, skipAutoRestore, signalVfsReady]);

  // --- Handlers ---

  /** Delete a recent project from the list */
  const handleDeleteRecentProject = useCallback(async (projectId: string) => {
    try {
      if (isElectron) {
        const storage = new ElectronStorageProvider();
        await storage.initialize();
        await storage.removeRecentProject(projectId);

        const updatedProjects = await storage.getRecentProjects();
        const entries: RecentProjectEntry[] = updatedProjects.map((p) => ({
          projectId: p.id,
          name: p.name,
          lastAccessedAt: Date.now(),
          rootDirName: p.rootPath.split("/").pop(),
        }));
        setRecentProjects(entries);
      } else {
        const projectManager = getProjectManager();
        await projectManager.removeProjectHandle(projectId);

        const handles = await projectManager.listProjectHandles();
        const entries: RecentProjectEntry[] = handles.map((h) => ({
          projectId: h.projectId,
          name: h.name ?? h.rootDirName ?? h.projectId,
          lastAccessedAt: h.lastAccessedAt,
          rootDirName: h.rootDirName,
        }));
        setRecentProjects(entries);
      }
    } catch (error) {
      console.error("Failed to delete recent project:", error);
    }
  }, [isElectron]);

  /** Show the CreateProjectWizard dialog */
  const handleCreateProject = useCallback(() => {
    setShowCreateWizard(true);
  }, []);

  /** Open an existing project from directory picker */
  const handleOpenProject = useCallback(async () => {
    try {
      const projectService = getProjectService();
      const project = await projectService.openProject();
      setProjectMode(project);
      await loadProjectContent(project);

      if (isElectron && project.rootPath) {
        const storage = new ElectronStorageProvider();
        await storage.initialize();
        await storage.addRecentProject({
          id: project.projectId,
          rootPath: project.rootPath,
          name: project.name,
        });
        void window.electronAPI?.rebuildMenu?.();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (error instanceof Error && error.message.includes("cancelled")) {
        return;
      }
      console.error("Failed to open project:", error);
    }
  }, [setProjectMode, isElectron, loadProjectContent]);

  /** Open a standalone file via the existing file-open flow */
  const handleOpenStandaloneFile = useCallback(async () => {
    try {
      const projectService = getProjectService();
      const standalone = await projectService.openStandaloneFile();
      setStandaloneMode(standalone);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to open file:", error);
    }
  }, [setStandaloneMode]);

  /** Open a recently-stored project by its ID */
  const handleOpenRecentProject = useCallback(async (projectId: string) => {
    try {
      // Electron: restore from SQLite using VFS with stored rootPath
      if (isElectron) {
        const storage = new ElectronStorageProvider();
        await storage.initialize();
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
          const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions");
          const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
          const metadataText = await projectJsonHandle.read();
          const metadata = JSON.parse(metadataText) as ProjectMode["metadata"];

          let workspaceState: ProjectMode["workspaceState"];
          try {
            const wsHandle = await illusionsDir.getFileHandle("workspace.json");
            const wsText = await wsHandle.read();
            workspaceState = JSON.parse(wsText) as ProjectMode["workspaceState"];
          } catch {
            const { getDefaultWorkspaceState } = await import("@/lib/project-types");
            workspaceState = getDefaultWorkspaceState();
          }

          const mainFileHandle = await rootDirHandle.getFileHandle(metadata.mainFile);
          const nativeMainFileHandle = (mainFileHandle as unknown as FileSystemFileHandle);
          const nativeRootHandle = (rootDirHandle as unknown as FileSystemDirectoryHandle);

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
          await loadProjectContent(restoredProject);
        } catch (error) {
          signalVfsReady();
          console.error("Failed to load project:", error);
          console.error("Project path:", project.rootPath);

          const isFileNotFound = error && typeof error === 'object' &&
            ('code' in error && (error as { code: string }).code === 'ENOENT');

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
  }, [isElectron, setProjectMode, openRestoredProject, loadProjectContent, signalVfsReady]);

  /** Open a project from a file system path (when .mdi file is double-clicked in a project directory) */
  const handleOpenAsProject = useCallback(async (projectPath: string, initialFile: string) => {
    try {
      const vfs = getVFS();
      if ("setRootPath" in vfs) {
        await (vfs as { setRootPath: (p: string) => Promise<void> }).setRootPath(projectPath);
      }

      const rootDirHandle = await vfs.getDirectoryHandle("");
      const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions");
      const projectJsonHandle = await illusionsDir.getFileHandle("project.json");
      const metadataText = await projectJsonHandle.read();
      const metadata = JSON.parse(metadataText) as ProjectMode["metadata"];

      let workspaceState: ProjectMode["workspaceState"];
      try {
        const wsHandle = await illusionsDir.getFileHandle("workspace.json");
        const wsText = await wsHandle.read();
        workspaceState = JSON.parse(wsText) as ProjectMode["workspaceState"];
      } catch {
        const { getDefaultWorkspaceState } = await import("@/lib/project-types");
        workspaceState = getDefaultWorkspaceState();
      }

      const initialFileHandle = await rootDirHandle.getFileHandle(initialFile);
      const nativeMainFileHandle = (initialFileHandle as unknown as FileSystemFileHandle);
      const nativeRootHandle = (rootDirHandle as unknown as FileSystemDirectoryHandle);

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

      const storage = new ElectronStorageProvider();
      await storage.initialize();
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

  // Auto-restore the last opened project on startup
  const autoRestoreTriggeredRef = useRef(false);
  useEffect(() => {
    if (!autoRestoreProjectId || autoRestoreTriggeredRef.current) return;
    autoRestoreTriggeredRef.current = true;

    let timerId: ReturnType<typeof setTimeout> | undefined;
    isAutoRestoringRef.current = true;
    void (async () => {
      try {
        await handleOpenRecentProject(autoRestoreProjectId);
      } catch {
        // handleOpenRecentProject catches its own errors internally
      }
      isAutoRestoringRef.current = false;
      timerId = setTimeout(() => {
        setIsRestoring((prev) => {
          if (prev && isElectron) {
            setRestoreError("前回のプロジェクトを開けませんでした。フォルダが移動または削除された可能性があります。");
          }
          return false;
        });
      }, 200);
    })();

    return () => {
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, [autoRestoreProjectId, handleOpenRecentProject, isElectron]);

  /** Called when the CreateProjectWizard successfully creates a project */
  const handleProjectCreated = useCallback(async (project: ProjectMode) => {
    setProjectMode(project);
    setShowCreateWizard(false);
    await loadProjectContent(project);

    if (isElectron && project.rootPath) {
      const storage = new ElectronStorageProvider();
      await storage.initialize();
      await storage.addRecentProject({
        id: project.projectId,
        rootPath: project.rootPath,
        name: project.name,
      });
      void window.electronAPI?.rebuildMenu?.();
    }
  }, [setProjectMode, isElectron, loadProjectContent]);

  /** Called when permission is granted for a restored project */
  const handlePermissionGranted = useCallback(() => {
    if (permissionPromptData) {
      void openRestoredProject(permissionPromptData.handle);
    }
    setShowPermissionPrompt(false);
    setPermissionPromptData(null);
  }, [permissionPromptData, openRestoredProject]);

  /** Called when permission is denied for a restored project */
  const handlePermissionDenied = useCallback(() => {
    setShowPermissionPrompt(false);
    setPermissionPromptData(null);
  }, []);

  // --- Upgrade banner handlers ---

  /** Handle upgrading from standalone to project mode */
  const handleUpgrade = useCallback(async () => {
    if (!isStandaloneMode(editorMode)) return;
    try {
      const upgradeService = getProjectUpgradeService();
      const project = await upgradeService.upgradeToProject(editorMode, content);
      setProjectMode(project);
      setShowUpgradeBanner(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to upgrade to project:", error);
    }
  }, [editorMode, content, setProjectMode]);

  /** Dismiss the upgrade banner for this session */
  const handleUpgradeDismiss = useCallback(() => {
    setShowUpgradeBanner(false);
    setUpgradeBannerDismissed(true);
  }, []);

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
