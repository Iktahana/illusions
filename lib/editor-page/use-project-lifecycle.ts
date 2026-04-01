import { useCallback, useRef, useState } from "react";

import { getStorageService } from "@/lib/storage/storage-service";
import { getProjectUpgradeService } from "@/lib/project/project-upgrade";
import { isStandaloneMode } from "@/lib/project/project-types";

import type { EditorMode, ProjectMode, StandaloneMode } from "@/lib/project/project-types";
import { useUpgradeBanner } from "./use-upgrade-banner";
import { useRecentProjects } from "./use-recent-projects";
import { useAutoRestore } from "./use-auto-restore";
import { usePermissions } from "./use-permissions";
import { useProjectInitialization } from "./use-project-initialization";
import { useFileOpening } from "./use-file-opening";

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
  handleOpenRecentProject: (projectId: string) => Promise<boolean>;
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
 * Thin orchestration hook that manages the full project lifecycle.
 *
 * Delegates to focused sub-hooks:
 * - {@link useUpgradeBanner} — upgrade banner state
 * - {@link useRecentProjects} — recent project list management
 * - {@link useAutoRestore} — startup session restore
 * - {@link usePermissions} — permission prompt state and handlers
 * - {@link useProjectInitialization} — VFS setup and project content loading
 * - {@link useFileOpening} — file/project open dialog handlers
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
  const [confirmRemoveRecent, setConfirmRemoveRecent] = useState<{
    projectId: string;
    message: string;
  } | null>(null);

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

  // VFS setup and project content loading
  const { loadProjectContent, openRestoredProject } = useProjectInitialization({
    isElectron,
    isAutoRestoringRef,
    tabLoadSystemFile,
    incrementEditorKey,
    setProjectMode,
  });

  // Permission prompt state and handlers
  const {
    showPermissionPrompt,
    permissionPromptData,
    handlePermissionGranted,
    handlePermissionDenied,
    setShowPermissionPrompt,
    setPermissionPromptData,
  } = usePermissions(openRestoredProject);

  // File/project open dialog handlers
  const {
    handleOpenProject,
    handleOpenStandaloneFile,
    handleOpenRecentProject,
    handleOpenAsProject,
  } = useFileOpening({
    isElectron,
    isAutoRestoringRef,
    setProjectMode,
    setStandaloneMode,
    setConfirmRemoveRecent,
    setPermissionPromptData,
    setShowPermissionPrompt,
    signalVfsReady,
    loadProjectContent,
    openRestoredProject,
  });

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

  const handleCreateProject = useCallback(() => {
    setShowCreateWizard(true);
  }, []);

  const handleProjectCreated = useCallback(
    async (project: ProjectMode) => {
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
    },
    [setProjectMode, isElectron, loadProjectContent],
  );

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
