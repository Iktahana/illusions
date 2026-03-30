import { useCallback, useEffect, useState } from "react";

import { getProjectManager } from "@/lib/project/project-manager";
import { getStorageService } from "@/lib/storage/storage-service";

import type { RecentProjectEntry } from "./types";

export interface UseRecentProjectsResult {
  recentProjects: RecentProjectEntry[];
  autoRestoreProjectId: string | null;
  handleDeleteRecentProject: (projectId: string) => Promise<void>;
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
          const projects = await storage.getRecentProjects();
          if (!mounted) return;

          const entries: RecentProjectEntry[] = projects.map((p) => ({
            projectId: p.id,
            name: p.name,
            lastAccessedAt: Date.now(),
            rootDirName: p.rootPath.split(/[/\\]/).filter(Boolean).pop(),
          }));
          setRecentProjects(entries);

          if (!skipAutoRestore && projects.length > 0) {
            setAutoRestoreProjectId(projects[0].id);
          } else {
            onNoRestore();
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
            onNoRestore();
          }
        }
      } catch (error) {
        console.error("Failed to load recent projects:", error);
        onNoRestore();
      }
    };

    void loadRecentProjects();

    return () => {
      mounted = false;
    };
  }, [isElectron, skipAutoRestore, onNoRestore]);

  const handleDeleteRecentProject = useCallback(async (projectId: string) => {
    try {
      if (isElectron) {
        const storage = getStorageService();
        await storage.removeRecentProject(projectId);

        const updatedProjects = await storage.getRecentProjects();
        const entries: RecentProjectEntry[] = updatedProjects.map((p) => ({
          projectId: p.id,
          name: p.name,
          lastAccessedAt: Date.now(),
          rootDirName: p.rootPath.split(/[/\\]/).filter(Boolean).pop(),
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
          rootDirName: h.rootDirName,
        }));
        setRecentProjects(entries);
      }
    } catch (error) {
      console.error("Failed to delete recent project:", error);
    }
  }, [isElectron]);

  return { recentProjects, autoRestoreProjectId, handleDeleteRecentProject };
}
