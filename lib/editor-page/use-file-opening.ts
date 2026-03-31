import { useCallback } from "react";

import { getStorageService } from "@/lib/storage/storage-service";
import { getProjectService } from "@/lib/project/project-service";
import { getDefaultWorkspaceState } from "@/lib/project/project-types";
import { getVFS } from "@/lib/vfs";
import { notificationManager } from "@/lib/services/notification-manager";

import type { ProjectMode, StandaloneMode } from "@/lib/project/project-types";
import { ensureProjectJson, readFileHandle } from "./project-file-utils";

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
}

export interface UseFileOpeningResult {
  handleOpenProject: () => Promise<void>;
  handleOpenStandaloneFile: () => Promise<void>;
  handleOpenRecentProject: (projectId: string) => Promise<void>;
  handleOpenAsProject: (projectPath: string, initialFile: string) => Promise<void>;
}

/**
 * Provides file-open and project-open handlers:
 * - {@link handleOpenProject}: opens a project via the native/web dialog
 * - {@link handleOpenStandaloneFile}: opens a single file via the native/web dialog
 * - {@link handleOpenRecentProject}: opens a project by ID from the recent list (Electron or Web)
 * - {@link handleOpenAsProject}: sets the VFS root to a given path and opens it as a project
 *
 * Depends on {@link useProjectInitialization} for `loadProjectContent` and `openRestoredProject`.
 */
export function useFileOpening({
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
}: UseFileOpeningParams): UseFileOpeningResult {
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

  const handleOpenRecentProject = useCallback(
    async (projectId: string) => {
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
              await (vfs as { setRootPath: (p: string) => Promise<void> }).setRootPath(
                project.rootPath,
              );
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

            const isFileNotFound =
              error &&
              typeof error === "object" &&
              "code" in error &&
              (error as { code: string }).code === "ENOENT";

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
            notificationManager.error(
              "このプロジェクトを開けませんでした。「プロジェクトを開く」から再度選択してください。",
            );
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
    },
    [
      isElectron,
      isAutoRestoringRef,
      setProjectMode,
      openRestoredProject,
      loadProjectContent,
      signalVfsReady,
      setConfirmRemoveRecent,
      setPermissionPromptData,
      setShowPermissionPrompt,
    ],
  );

  const handleOpenAsProject = useCallback(
    async (projectPath: string, initialFile: string) => {
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
        notificationManager.error(
          "プロジェクトを開けませんでした。.illusionsフォルダが正しく設定されているか確認してください。",
        );
      }
    },
    [setProjectMode, loadProjectContent],
  );

  return {
    handleOpenProject,
    handleOpenStandaloneFile,
    handleOpenRecentProject,
    handleOpenAsProject,
  };
}
