/**
 * GitHub Repository Manager
 * 
 * Manages GitHub repositories for novel projects.
 */

import { Octokit } from "@octokit/rest";
import type { GitHubRepo, CreateRepoOptions } from "./types";

export class GitHubRepoManager {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Create a new GitHub repository for a novel.
   */
  async createRepo(options: CreateRepoOptions): Promise<GitHubRepo> {
    try {
      const { data } = await this.octokit.rest.repos.createForAuthenticatedUser({
        name: options.name,
        description: options.description || "小説プロジェクト",
        private: options.private ?? true,
        auto_init: options.auto_init ?? false,
      });

      return this.mapRepoData(data);
    } catch (error: any) {
      if (error.status === 422) {
        throw new Error(`リポジトリ名 "${options.name}" は既に使用されています。`);
      }
      console.error("Failed to create repository:", error);
      throw new Error("リポジトリの作成に失敗しました。");
    }
  }

  /**
   * Get repository information.
   */
  async getRepo(owner: string, name: string): Promise<GitHubRepo | null> {
    try {
      const { data } = await this.octokit.rest.repos.get({
        owner,
        repo: name,
      });

      return this.mapRepoData(data);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      console.error("Failed to get repository:", error);
      throw error;
    }
  }

  /**
   * Update repository settings.
   */
  async updateRepo(
    owner: string,
    name: string,
    updates: {
      description?: string;
      private?: boolean;
    }
  ): Promise<GitHubRepo> {
    try {
      const { data } = await this.octokit.rest.repos.update({
        owner,
        repo: name,
        description: updates.description,
        private: updates.private,
      });

      return this.mapRepoData(data);
    } catch (error) {
      console.error("Failed to update repository:", error);
      throw new Error("リポジトリの更新に失敗しました。");
    }
  }

  /**
   * Delete a repository.
   */
  async deleteRepo(owner: string, name: string): Promise<void> {
    try {
      await this.octokit.rest.repos.delete({
        owner,
        repo: name,
      });
    } catch (error) {
      console.error("Failed to delete repository:", error);
      throw new Error("リポジトリの削除に失敗しました。");
    }
  }

  /**
   * List all repositories for the authenticated user.
   */
  async listRepos(): Promise<GitHubRepo[]> {
    try {
      const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 100,
      });

      return data.map((repo) => this.mapRepoData(repo));
    } catch (error) {
      console.error("Failed to list repositories:", error);
      throw new Error("リポジトリの取得に失敗しました。");
    }
  }

  /**
   * Check if a repository exists.
   */
  async repoExists(owner: string, name: string): Promise<boolean> {
    const repo = await this.getRepo(owner, name);
    return repo !== null;
  }

  /**
   * Get repository content (for checking if novel.mdi exists).
   */
  async getFileContent(
    owner: string,
    name: string,
    path: string
  ): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo: name,
        path,
      });

      if ("content" in data && typeof data.content === "string") {
        // Decode base64 content
        return Buffer.from(data.content, "base64").toString("utf8");
      }

      return null;
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create initial README.md file.
   */
  async createReadme(owner: string, name: string, novelTitle: string): Promise<void> {
    const readmeContent = `# ${novelTitle}

このリポジトリは [Illusions](https://github.com/your-username/illusions) で管理されている小説プロジェクトです。

## ファイル構成

- \`novel.mdi\` - 小説の原稿ファイル（Markdown形式）

## バージョン管理

このプロジェクトはGitによるバージョン管理を使用しています。
各保存操作が自動的にコミットされ、定期的にGitHubに同期されます。

## 編集

このプロジェクトを編集するには、Illusionsアプリケーションで開いてください。
`;

    try {
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo: name,
        path: "README.md",
        message: "初期READMEを追加",
        content: Buffer.from(readmeContent, "utf8").toString("base64"),
      });
    } catch (error) {
      console.error("Failed to create README:", error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Map GitHub API response to our GitHubRepo type.
   */
  private mapRepoData(data: any): GitHubRepo {
    return {
      id: data.id,
      name: data.name,
      full_name: data.full_name,
      owner: {
        login: data.owner.login,
      },
      html_url: data.html_url,
      description: data.description,
      private: data.private,
      created_at: data.created_at,
      updated_at: data.updated_at,
      pushed_at: data.pushed_at,
      clone_url: data.clone_url,
      default_branch: data.default_branch,
    };
  }
}
