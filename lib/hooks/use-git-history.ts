/**
 * useGitHistory Hook
 * 
 * Manages Git commit history for a project.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { GitService } from "../git/git-service";
import type { GitCommit, GitBranch, GitTag } from "../git/types";

interface UseGitHistoryReturn {
  commits: GitCommit[];
  branches: GitBranch[];
  tags: GitTag[];
  isLoading: boolean;
  error: string | null;
  
  loadHistory: (depth?: number) => Promise<void>;
  checkoutCommit: (commitHash: string) => Promise<string>;
  createBranch: (name: string) => Promise<void>;
  createTag: (name: string, message: string, commitHash?: string) => Promise<void>;
  readFileAtCommit: (commitHash: string, filepath: string) => Promise<string>;
}

export function useGitHistory(projectId: string | null): UseGitHistoryReturn {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [tags, setTags] = useState<GitTag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gitService = projectId ? new GitService(projectId) : null;

  const loadHistory = useCallback(async (depth: number = 100) => {
    if (!gitService) {
      setError("プロジェクトが選択されていません");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [commitList, branchList, tagList] = await Promise.all([
        gitService.getLog(depth),
        gitService.getBranches(),
        gitService.getTags(),
      ]);

      setCommits(commitList);
      setBranches(branchList);
      setTags(tagList);
    } catch (err) {
      console.error("Failed to load history:", err);
      setError(err instanceof Error ? err.message : "履歴の読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [gitService]);

  const checkoutCommit = useCallback(async (commitHash: string): Promise<string> => {
    if (!gitService) {
      throw new Error("プロジェクトが選択されていません");
    }

    try {
      await gitService.checkout(commitHash);
      const content = await gitService.readCurrentContent();
      return content;
    } catch (err) {
      console.error("Failed to checkout commit:", err);
      throw new Error("コミットのチェックアウトに失敗しました");
    }
  }, [gitService]);

  const createBranch = useCallback(async (name: string): Promise<void> => {
    if (!gitService) {
      throw new Error("プロジェクトが選択されていません");
    }

    try {
      await gitService.createBranch(name);
      await loadHistory();
    } catch (err) {
      console.error("Failed to create branch:", err);
      throw new Error("ブランチの作成に失敗しました");
    }
  }, [gitService, loadHistory]);

  const createTag = useCallback(async (
    name: string,
    message: string,
    commitHash: string = "HEAD"
  ): Promise<void> => {
    if (!gitService) {
      throw new Error("プロジェクトが選択されていません");
    }

    try {
      await gitService.createTag(name, message, commitHash);
      await loadHistory();
    } catch (err) {
      console.error("Failed to create tag:", err);
      throw new Error("タグの作成に失敗しました");
    }
  }, [gitService, loadHistory]);

  const readFileAtCommit = useCallback(async (
    commitHash: string,
    filepath: string
  ): Promise<string> => {
    if (!gitService) {
      throw new Error("プロジェクトが選択されていません");
    }

    try {
      return await gitService.readFile(commitHash, filepath);
    } catch (err) {
      console.error("Failed to read file:", err);
      throw new Error("ファイルの読み込みに失敗しました");
    }
  }, [gitService]);

  // Load history when project changes
  useEffect(() => {
    if (projectId) {
      loadHistory();
    } else {
      setCommits([]);
      setBranches([]);
      setTags([]);
    }
  }, [projectId, loadHistory]);

  return {
    commits,
    branches,
    tags,
    isLoading,
    error,
    loadHistory,
    checkoutCommit,
    createBranch,
    createTag,
    readFileAtCommit,
  };
}
