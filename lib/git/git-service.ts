/**
 * Git Service
 * 
 * Core Git operations using isomorphic-git and LightningFS.
 * Provides commit, push, pull, and history management.
 */

import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import FS from "@isomorphic-git/lightning-fs";
import type { GitAuthor, GitCommit, GitBranch, GitTag } from "./types";

export class GitService {
  private fs: FS;
  private dir: string;
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.fs = new FS(`illusions-git-${projectId}`);
    this.dir = "/";
  }

  /**
   * Initialize a new Git repository.
   */
  async init(): Promise<void> {
    try {
      await git.init({
        fs: this.fs,
        dir: this.dir,
        defaultBranch: "main",
      });
    } catch (error) {
      console.error("Failed to initialize git repository:", error);
      throw error;
    }
  }

  /**
   * Set remote origin URL.
   */
  async setRemote(url: string): Promise<void> {
    try {
      // Remove existing remote if any
      try {
        await git.deleteRemote({
          fs: this.fs,
          dir: this.dir,
          remote: "origin",
        });
      } catch {
        // Remote doesn't exist, ignore
      }

      // Add new remote
      await git.addRemote({
        fs: this.fs,
        dir: this.dir,
        remote: "origin",
        url,
      });
    } catch (error) {
      console.error("Failed to set remote:", error);
      throw error;
    }
  }

  /**
   * Write content to the repository and create a commit.
   */
  async commit(message: string, content: string, author: GitAuthor): Promise<string> {
    try {
      // Write novel.mdi file
      await this.fs.promises.writeFile(`${this.dir}novel.mdi`, content, "utf8");

      // Stage the file
      await git.add({
        fs: this.fs,
        dir: this.dir,
        filepath: "novel.mdi",
      });

      // Create commit
      const sha = await git.commit({
        fs: this.fs,
        dir: this.dir,
        message,
        author: {
          name: author.name,
          email: author.email,
          timestamp: author.timestamp || Math.floor(Date.now() / 1000),
          timezoneOffset: author.timezoneOffset || new Date().getTimezoneOffset(),
        },
      });

      return sha;
    } catch (error) {
      console.error("Failed to commit:", error);
      throw error;
    }
  }

  /**
   * Push commits to remote.
   */
  async push(token: string, onProgress?: (progress: any) => void): Promise<void> {
    try {
      await git.push({
        fs: this.fs,
        http,
        dir: this.dir,
        remote: "origin",
        ref: "main",
        onAuth: () => ({
          username: token,
          password: "x-oauth-basic",
        }),
        onProgress,
      });
    } catch (error: any) {
      // Handle specific errors
      if (error.message?.includes("401")) {
        throw new Error("認証に失敗しました。GitHub トークンを確認してください。");
      } else if (error.message?.includes("403")) {
        throw new Error("アクセスが拒否されました。リポジトリの権限を確認してください。");
      } else if (error.message?.includes("404")) {
        throw new Error("リポジトリが見つかりません。");
      }
      console.error("Failed to push:", error);
      throw error;
    }
  }

  /**
   * Pull commits from remote.
   */
  async pull(token: string, onProgress?: (progress: any) => void): Promise<void> {
    try {
      await git.pull({
        fs: this.fs,
        http,
        dir: this.dir,
        ref: "main",
        singleBranch: true,
        onAuth: () => ({
          username: token,
          password: "x-oauth-basic",
        }),
        onProgress,
      });
    } catch (error: any) {
      if (error.message?.includes("MergeNotSupportedError")) {
        throw new Error("マージが必要です。競合が発生している可能性があります。");
      }
      console.error("Failed to pull:", error);
      throw error;
    }
  }

  /**
   * Get commit history.
   */
  async getLog(depth: number = 100): Promise<GitCommit[]> {
    try {
      const logs = await git.log({
        fs: this.fs,
        dir: this.dir,
        depth,
      });

      return logs.map((log) => ({
        oid: log.oid,
        message: log.commit.message,
        author: {
          name: log.commit.author.name,
          email: log.commit.author.email,
          timestamp: log.commit.author.timestamp,
          timezoneOffset: log.commit.author.timezoneOffset,
        },
        committer: {
          name: log.commit.committer.name,
          email: log.commit.committer.email,
          timestamp: log.commit.committer.timestamp,
          timezoneOffset: log.commit.committer.timezoneOffset,
        },
        timestamp: log.commit.author.timestamp * 1000, // Convert to milliseconds
        parent: log.commit.parent,
      }));
    } catch (error) {
      console.error("Failed to get log:", error);
      return [];
    }
  }

  /**
   * Read file content at a specific commit.
   */
  async readFile(commitHash: string, filepath: string): Promise<string> {
    try {
      const { blob } = await git.readBlob({
        fs: this.fs,
        dir: this.dir,
        oid: commitHash,
        filepath,
      });

      return new TextDecoder().decode(blob);
    } catch (error) {
      console.error("Failed to read file:", error);
      throw error;
    }
  }

  /**
   * Checkout a specific commit.
   */
  async checkout(ref: string): Promise<void> {
    try {
      await git.checkout({
        fs: this.fs,
        dir: this.dir,
        ref,
        force: true,
      });
    } catch (error) {
      console.error("Failed to checkout:", error);
      throw error;
    }
  }

  /**
   * Get list of branches.
   */
  async getBranches(): Promise<GitBranch[]> {
    try {
      const branches = await git.listBranches({
        fs: this.fs,
        dir: this.dir,
      });

      const currentBranch = await git.currentBranch({
        fs: this.fs,
        dir: this.dir,
      });

      const branchList: GitBranch[] = [];

      for (const branch of branches) {
        try {
          const commitHash = await git.resolveRef({
            fs: this.fs,
            dir: this.dir,
            ref: branch,
          });

          branchList.push({
            name: branch,
            current: branch === currentBranch,
            commitHash,
          });
        } catch {
          // Skip branches that can't be resolved
        }
      }

      return branchList;
    } catch (error) {
      console.error("Failed to get branches:", error);
      return [];
    }
  }

  /**
   * Create a new branch.
   */
  async createBranch(name: string): Promise<void> {
    try {
      await git.branch({
        fs: this.fs,
        dir: this.dir,
        ref: name,
      });
    } catch (error) {
      console.error("Failed to create branch:", error);
      throw error;
    }
  }

  /**
   * Create a tag.
   */
  async createTag(name: string, message: string, ref: string = "HEAD"): Promise<void> {
    try {
      const oid = await git.resolveRef({
        fs: this.fs,
        dir: this.dir,
        ref,
      });

      await git.tag({
        fs: this.fs,
        dir: this.dir,
        ref: name,
        object: oid,
      });
    } catch (error) {
      console.error("Failed to create tag:", error);
      throw error;
    }
  }

  /**
   * Get list of tags.
   */
  async getTags(): Promise<GitTag[]> {
    try {
      const tags = await git.listTags({
        fs: this.fs,
        dir: this.dir,
      });

      const tagList: GitTag[] = [];

      for (const tag of tags) {
        try {
          const commitHash = await git.resolveRef({
            fs: this.fs,
            dir: this.dir,
            ref: tag,
          });

          tagList.push({
            name: tag,
            commitHash,
          });
        } catch {
          // Skip tags that can't be resolved
        }
      }

      return tagList;
    } catch (error) {
      console.error("Failed to get tags:", error);
      return [];
    }
  }

  /**
   * Check if there are uncommitted changes.
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await git.statusMatrix({
        fs: this.fs,
        dir: this.dir,
      });

      // Check if any file has changes
      return status.some((row) => row[1] !== row[2] || row[2] !== row[3]);
    } catch (error) {
      console.error("Failed to check status:", error);
      return false;
    }
  }

  /**
   * Clone a repository from remote.
   */
  async clone(url: string, token: string, onProgress?: (progress: any) => void): Promise<void> {
    try {
      await git.clone({
        fs: this.fs,
        http,
        dir: this.dir,
        url,
        ref: "main",
        singleBranch: true,
        onAuth: () => ({
          username: token,
          password: "x-oauth-basic",
        }),
        onProgress,
      });
    } catch (error) {
      console.error("Failed to clone:", error);
      throw error;
    }
  }

  /**
   * Read current novel.mdi content.
   */
  async readCurrentContent(): Promise<string> {
    try {
      const content = await this.fs.promises.readFile(`${this.dir}novel.mdi`, "utf8");
      return content as string;
    } catch (error) {
      console.error("Failed to read current content:", error);
      return "";
    }
  }
}
