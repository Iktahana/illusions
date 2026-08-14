import { useCallback, useEffect, useState } from "react";

import { getProjectManager } from "@/lib/project/project-manager";
import { getStorageService } from "@/lib/storage/storage-service";
import { formatLocation } from "@/lib/location/format-location";

import type { RecentProjectEntry } from "./types";

export const RECENT_PROJECTS_LOAD_TIMEOUT_MS = 10_000;

export interface UseRecentProjectsResult {
  recentProjects: RecentProjectEntry[];
  autoRestoreProjectId: string | null;
  handleDeleteRecentProject: (projectId: string) => Promise<void>;
}

async function loadWithStartupTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Recent projects startup load timed out")),
          RECENT_PROJECTS_LOAD_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Loads and manages the list of recent projects.
 * Sets autoRestoreProjectId when a project should be auto-restored on startup.
 */
export function useRecentProjects(
  isElectron: boolean,
  skipAutoRestore: boolean,
  onNoRestore: () => void,
): UseRecentProjectsResult {
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([]);
  const [autoRestoreProjectId, setAutoRestoreProjectId] = useState<string | null>(null);

  // Load recent projects on mount
  useEffect(() => {
    let mounted = true;

    const loadRecentProjects = async () => {
      try {
        if (isElectron) {
          const storage = getStorageService();
          const [projects, locationContext] = await loadWithStartupTimeout(
            Promise.all([
              storage.getRecentProjects(),
              window.electronAPI?.getLocationContext?.() ??
                Promise.resolve({ platform: "linux", homePath: null }),
            ]),
          );
          if (!mounted) return;

          const entries: RecentProjectEntry[] = projects.map((p) => ({
            projectId: p.id,
            name: p.name,
            lastAccessedAt: p.lastAccessedAt ?? 0,
            displayPath: formatLocation({ rootPath: p.rootPath, ...locationContext }),
            rootPath: p.rootPath,
          }));
          setRecentProjects(entries);

          if (!skipAutoRestore && projects.length > 0) {
            setAutoRestoreProjectId(projects[0].id);
          } else {
            onNoRestore();
          }
        } else {
          const projectManager = getProjectManager();
          const handles = await loadWithStartupTimeout(projectManager.listProjectHandles());
          if (!mounted) return;

          const entries: RecentProjectEntry[] = handles.map((h) => ({
            projectId: h.projectId,
            name: h.name ?? h.rootDirName ?? h.projectId,
            lastAccessedAt: h.lastAccessedAt,
            displayPath: h.rootDirName ?? h.name ?? h.projectId,
          }));
          setRecentProjects(entries);

          if (!skipAutoRestore && handles.length > 0) {
            setAutoRestoreProjectId(handles[0].projectId);
          } else {
            onNoRestore();
          }
        }
      } catch (error) {
        if (!mounted) return;
        console.error("Failed to load recent projects:", error);
        onNoRestore();
      }
    };

    void loadRecentProjects();

    return () => {
      mounted = false;
    };
  }, [isElectron, skipAutoRestore, onNoRestore]);

  const handleDeleteRecentProject = useCallback(
    async (projectId: string) => {
      try {
        if (isElectron) {
          const storage = getStorageService();
          await storage.removeRecentProject(projectId);

          const [updatedProjects, locationContext] = await Promise.all([
            storage.getRecentProjects(),
            window.electronAPI?.getLocationContext?.() ??
              Promise.resolve({ platform: "linux", homePath: null }),
          ]);
          const entries: RecentProjectEntry[] = updatedProjects.map((p) => ({
            projectId: p.id,
            name: p.name,
            lastAccessedAt: p.lastAccessedAt ?? 0,
            displayPath: formatLocation({ rootPath: p.rootPath, ...locationContext }),
            rootPath: p.rootPath,
          }));
          setRecentProjects(entries);
          void window.electronAPI?.rebuildMenu?.();
        } else {
          const projectManager = getProjectManager();
          await projectManager.removeProjectHandle(projectId);

          const handles = await projectManager.listProjectHandles();
          const entries: RecentProjectEntry[] = handles.map((h) => ({
            projectId: h.projectId,
            name: h.name ?? h.rootDirName ?? h.projectId,
            lastAccessedAt: h.lastAccessedAt,
            displayPath: h.rootDirName ?? h.name ?? h.projectId,
          }));
          setRecentProjects(entries);
        }
      } catch (error) {
        console.error("Failed to delete recent project:", error);
      }
    },
    [isElectron],
  );

  return { recentProjects, autoRestoreProjectId, handleDeleteRecentProject };
}
