/**
 * useProjects Hook
 * 
 * Manages novel projects (local and GitHub).
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchAppState, persistAppState } from "../app-state-manager";
import { getGitHubAuthService } from "../github/auth";
import { GitHubRepoManager } from "../github/repo-manager";
import { GitService } from "../git/git-service";
import type { ProjectMetadata } from "../storage-types";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface UseProjectsReturn {
  projects: ProjectMetadata[];
  currentProject: ProjectMetadata | null;
  isLoading: boolean;
  error: string | null;
  
  createLocalProject: (name: string) => Promise<ProjectMetadata>;
  uploadToGitHub: (projectId: string, repoName: string) => Promise<void>;
  importFromGitHub: (repoFullName: string) => Promise<ProjectMetadata>;
  setCurrentProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  updateProjectMetadata: (projectId: string, updates: Partial<ProjectMetadata["metadata"]>) => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProject, setCurrentProjectState] = useState<ProjectMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authService = getGitHubAuthService();

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const appState = await fetchAppState();
      const loadedProjects = appState?.projects || [];
      setProjects(loadedProjects);

      // Set current project
      if (appState?.currentProjectId) {
        const current = loadedProjects.find((p) => p.id === appState.currentProjectId);
        setCurrentProjectState(current || null);
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError("プロジェクトの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const createLocalProject = useCallback(async (name: string): Promise<ProjectMetadata> => {
    const project: ProjectMetadata = {
      id: generateId(),
      name,
      type: "local",
      metadata: {
        wordCount: 0,
        charCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };

    await saveProject(project);
    setProjects((prev) => [project, ...prev]);

    return project;
  }, []);

  const uploadToGitHub = useCallback(async (projectId: string, repoName: string): Promise<void> => {
    setError(null);

    try {
      // Get project
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        throw new Error("プロジェクトが見つかりません");
      }

      // Get GitHub token
      const token = await authService.getAccessToken();
      if (!token) {
        throw new Error("GitHub にログインしてください");
      }

      const user = await authService.getCurrentUser();
      if (!user) {
        throw new Error("ユーザー情報の取得に失敗しました");
      }

      // Create GitHub repository
      const repoManager = new GitHubRepoManager(token);
      const repo = await repoManager.createRepo({
        name: repoName,
        description: `小説プロジェクト: ${project.name}`,
        private: true,
      });

      // Initialize Git and push initial commit
      const gitService = new GitService(projectId);
      await gitService.init();
      await gitService.setRemote(repo.clone_url);

      // Create initial commit with empty content
      await gitService.commit(
        "初期コミット",
        "# " + project.name + "\n\n",
        {
          name: user.name,
          email: user.email || `${user.login}@users.noreply.github.com`,
        }
      );

      // Push to GitHub
      await gitService.push(token);

      // Create README
      await repoManager.createReadme(user.login, repo.name, project.name);

      // Update project metadata
      const updatedProject: ProjectMetadata = {
        ...project,
        type: "github",
        githubRepo: {
          owner: user.login,
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
        },
        metadata: {
          ...project.metadata,
          updatedAt: Date.now(),
        },
      };

      await saveProject(updatedProject);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updatedProject : p)));
    } catch (err) {
      console.error("Failed to upload to GitHub:", err);
      setError(err instanceof Error ? err.message : "GitHub へのアップロードに失敗しました");
      throw err;
    }
  }, [projects, authService]);

  const importFromGitHub = useCallback(async (repoFullName: string): Promise<ProjectMetadata> => {
    setError(null);

    try {
      // Parse owner/repo
      const [owner, repoName] = repoFullName.split("/");
      if (!owner || !repoName) {
        throw new Error("無効なリポジトリ名です（形式: owner/repo）");
      }

      // Get GitHub token
      const token = await authService.getAccessToken();
      if (!token) {
        throw new Error("GitHub にログインしてください");
      }

      // Get repository info
      const repoManager = new GitHubRepoManager(token);
      const repo = await repoManager.getRepo(owner, repoName);

      if (!repo) {
        throw new Error("リポジトリが見つかりません");
      }

      // Create project
      const projectId = generateId();
      const project: ProjectMetadata = {
        id: projectId,
        name: repo.name,
        type: "github",
        githubRepo: {
          owner,
          name: repoName,
          fullName: repo.full_name,
          url: repo.html_url,
        },
        metadata: {
          wordCount: 0,
          charCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      };

      // Clone repository
      const gitService = new GitService(projectId);
      await gitService.clone(repo.clone_url, token);

      // Try to read novel.mdi to get word count
      try {
        const content = await gitService.readCurrentContent();
        project.metadata.charCount = content.replace(/\s/g, "").length;
        project.metadata.wordCount = content.split(/\s+/).filter(Boolean).length;
      } catch {
        // File doesn't exist yet, keep default values
      }

      await saveProject(project);
      setProjects((prev) => [project, ...prev]);

      return project;
    } catch (err) {
      console.error("Failed to import from GitHub:", err);
      setError(err instanceof Error ? err.message : "GitHub からのインポートに失敗しました");
      throw err;
    }
  }, [authService]);

  const setCurrentProject = useCallback(async (projectId: string): Promise<void> => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error("プロジェクトが見つかりません");
    }

    await persistAppState({ currentProjectId: projectId });
    setCurrentProjectState(project);
  }, [projects]);

  const deleteProject = useCallback(async (projectId: string): Promise<void> => {
    await persistAppState({
      projects: projects.filter((p) => p.id !== projectId),
      currentProjectId: currentProject?.id === projectId ? undefined : undefined,
    });

    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (currentProject?.id === projectId) {
      setCurrentProjectState(null);
    }
  }, [projects, currentProject]);

  const updateProjectMetadata = useCallback(async (
    projectId: string,
    updates: Partial<ProjectMetadata["metadata"]>
  ): Promise<void> => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const updatedProject: ProjectMetadata = {
      ...project,
      metadata: {
        ...project.metadata,
        ...updates,
        updatedAt: Date.now(),
      },
    };

    await saveProject(updatedProject);
    setProjects((prev) => prev.map((p) => (p.id === projectId ? updatedProject : p)));

    if (currentProject?.id === projectId) {
      setCurrentProjectState(updatedProject);
    }
  }, [projects, currentProject]);

  return {
    projects,
    currentProject,
    isLoading,
    error,
    createLocalProject,
    uploadToGitHub,
    importFromGitHub,
    setCurrentProject,
    deleteProject,
    updateProjectMetadata,
  };
}

async function saveProject(project: ProjectMetadata): Promise<void> {
  const appState = await fetchAppState();
  const projects = appState?.projects || [];
  const existingIndex = projects.findIndex((p) => p.id === project.id);

  if (existingIndex >= 0) {
    projects[existingIndex] = project;
  } else {
    projects.unshift(project);
  }

  await persistAppState({ projects });
}
