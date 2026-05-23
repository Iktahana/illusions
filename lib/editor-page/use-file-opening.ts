import { useCallback } from "react";

import type { ProjectMode, StandaloneMode, WorkspaceTab } from "@/lib/project/project-types";

interface UseFileOpeningParams {
  isElectron: boolean;
  isAutoRestoringRef: React.MutableRefObject<boolean>;
  setProjectMode: (project: ProjectMode) => void;
  setStandaloneMode: (standalone: StandaloneMode) => void;
  setConfirmRemoveRecent: (value: { projectId: string; message: string } | null) => void;
  setPermissionPromptData: React.Dispatch<
    React.SetStateAction<import("./types").PermissionPromptState | null>
  >;
  setShowPermissionPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  signalVfsReady: () => void;
  /** Load a project's main file content into the editor */
  loadProjectContent: (project: ProjectMode) => Promise<void>;
  /** Read project.json from a restored directory handle and enter project mode */
  openRestoredProject: (handle: FileSystemDirectoryHandle) => Promise<void>;
  /** Load a file into the tab manager by path and content */
  tabLoadSystemFile: (path: string, content: string) => void;
  /** Increment editor key to force editor remount */
  incrementEditorKey: () => void;
  /** Restore tabs from workspace.json data loaded during project open */
  restoreProjectTabs: (
    savedTabs: { tabs: WorkspaceTab[]; activeIndex: number } | undefined,
    rootPath: string | null,
  ) => Promise<boolean>;
}

export interface UseFileOpeningResult {
  handleOpenProject: () => Promise<void>;
  handleOpenStandaloneFile: () => Promise<void>;
  handleOpenRecentProject: (projectId: string) => Promise<boolean>;
  handleOpenAsProject: (projectPath: string, initialFile: string) => Promise<void>;
}

/**
 * Phase 3 shim: load 経路を空洞化。Phase 7-8 で新 IO 抽象を経由して再構築する。
 *
 * Signature と return shape は維持し、各 handler は no-op に。
 */
export function useFileOpening(_params: UseFileOpeningParams): UseFileOpeningResult {
  const handleOpenProject = useCallback(async () => {
    // Phase 3 stub
  }, []);

  const handleOpenStandaloneFile = useCallback(async () => {
    // Phase 3 stub
  }, []);

  const handleOpenRecentProject = useCallback(async (_projectId: string): Promise<boolean> => {
    // Phase 3 stub: 復元失敗扱い
    return false;
  }, []);

  const handleOpenAsProject = useCallback(
    async (_projectPath: string, _initialFile: string): Promise<void> => {
      // Phase 3 stub
    },
    [],
  );

  return {
    handleOpenProject,
    handleOpenStandaloneFile,
    handleOpenRecentProject,
    handleOpenAsProject,
  };
}
