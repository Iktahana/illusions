import { useCallback } from "react";

import { getProjectService } from "@/lib/project/project-service";
import { getDefaultWorkspaceState } from "@/lib/project/project-types";
import { notificationManager } from "@/lib/services/notification-manager";

import type { ProjectMode } from "@/lib/project/project-types";
import { ensureProjectJson, readFileHandle } from "./project-file-utils";

interface UseProjectInitializationParams {
  isElectron: boolean;
  isAutoRestoringRef: React.MutableRefObject<boolean>;
  /** Load a file into the tab manager by path and content */
  tabLoadSystemFile: (path: string, content: string) => void;
  /** Increment editor key to force editor remount */
  incrementEditorKey: () => void;
  setProjectMode: (project: ProjectMode) => void;
}

export interface UseProjectInitializationResult {
  /** Load a project's main file content into the editor */
  loadProjectContent: (project: ProjectMode) => Promise<void>;
  /** Read project.json from a restored directory handle and enter project mode */
  openRestoredProject: (handle: FileSystemDirectoryHandle) => Promise<void>;
}

/**
 * Provides VFS/project initialization helpers:
 * - {@link loadProjectContent}: reads a project's main file and loads it into the editor
 * - {@link openRestoredProject}: restores a project from a directory handle (reads
 *   .illusions/project.json and .illusions/workspace.json, then sets project mode)
 *
 * Used internally by {@link useFileOpening} and {@link usePermissions}.
 */
export function useProjectInitialization({
  isElectron,
  isAutoRestoringRef,
  tabLoadSystemFile,
  incrementEditorKey,
  setProjectMode,
}: UseProjectInitializationParams): UseProjectInitializationResult {
  /** Load a project's main file content into the editor */
  const loadProjectContent = useCallback(
    async (project: ProjectMode) => {
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
          "プロジェクトのメインファイルを読み込めませんでした。ファイルが移動または削除された可能性があります。",
        );
      }
    },
    [isElectron, tabLoadSystemFile, incrementEditorKey],
  );

  /** Read project.json from a restored directory handle and enter project mode */
  const openRestoredProject = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      try {
        const { metadata, illusionsDir } = await ensureProjectJson(handle);

        let workspaceState: ProjectMode["workspaceState"];
        try {
          const workspaceJsonHandle = await illusionsDir.getFileHandle("workspace.json");
          const workspaceText = await readFileHandle(
            workspaceJsonHandle as Parameters<typeof readFileHandle>[0],
          );
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
    },
    [setProjectMode, loadProjectContent, isElectron, isAutoRestoringRef],
  );

  return { loadProjectContent, openRestoredProject };
}
