/**
 * Web Git Storage Implementation
 * 
 * Implements IGitStorageService for Web browsers using isomorphic-git
 * and LightningFS (IndexedDB-backed filesystem).
 */

import {
  IGitStorageService,
  GitHubRepository,
  GitHubUser,
  GitCommit,
  GitStatus,
  PullResult,
  ConflictInfo,
  GitAuthResult,
} from './git-storage-types';
import { getWebOAuth } from './oauth-web';

/**
 * Web Git Storage Service
 * Uses isomorphic-git with LightningFS for browser-based git operations
 */
export class WebGitStorage implements IGitStorageService {
  private fs: any; // LightningFS instance
  private currentRepository: string | null = null;
  private git: any; // isomorphic-git instance
  private dbName: string;

  constructor(dbName: string = 'illusions-git') {
    this.dbName = dbName;
    this.initializeGit();
  }

  /**
   * Initialize isomorphic-git with LightningFS
   */
  private async initializeGit(): Promise<void> {
    try {
      // Dynamically import modules
      const gitModule = await import('isomorphic-git');
      const LightningFS = (await import('@isomorphic-git/lightning-fs')).default;

      this.git = gitModule.default;

      // Create LightningFS instance
      this.fs = new LightningFS('illusions-fs');

      // Initialize filesystem
      await this.fs.mkdir('/git', { recursive: true });
    } catch (error) {
      console.error('Failed to initialize isomorphic-git with LightningFS:', error);
    }
  }

  /**
   * Ensure git is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.git || !this.fs) {
      await this.initializeGit();
    }
  }

  /**
   * Authentication
   */
  async login(): Promise<GitAuthResult> {
    const oauth = getWebOAuth();
    try {
      await oauth.initiateLogin();
      // The actual callback handling is done after redirect
      // This returns a placeholder
      return {
        success: false,
        error: 'OAuth flow initiated, waiting for callback',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async logout(): Promise<void> {
    const oauth = getWebOAuth();
    await oauth.logout();
    this.currentRepository = null;
  }

  async getCurrentUser(): Promise<GitHubUser | null> {
    const oauth = getWebOAuth();
    return oauth.getCurrentUser();
  }

  async isAuthenticated(): Promise<boolean> {
    const oauth = getWebOAuth();
    return oauth.isAuthenticated();
  }

  /**
   * Repository operations
   */
  async listRepositories(): Promise<GitHubRepository[]> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch('https://api.github.com/user/repos', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list repositories: ${response.statusText}`);
      }

      const repos = await response.json();
      return repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: { login: repo.owner.login },
        html_url: repo.html_url,
        description: repo.description,
        private: repo.private,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        clone_url: repo.clone_url,
        default_branch: repo.default_branch,
      }));
    } catch (error) {
      console.error('Failed to list repositories:', error);
      throw error;
    }
  }

  async createRepository(name: string, isPrivate: boolean): Promise<GitHubRepository> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          name,
          description: `Illusions manuscript: ${name}`,
          private: isPrivate,
          auto_init: true,
          gitignore_template: 'Node',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create repository: ${response.statusText}`);
      }

      const repo = await response.json();
      return {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: { login: repo.owner.login },
        html_url: repo.html_url,
        description: repo.description,
        private: repo.private,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        clone_url: repo.clone_url,
        default_branch: repo.default_branch,
      };
    } catch (error) {
      console.error('Failed to create repository:', error);
      throw error;
    }
  }

  async cloneRepository(url: string, localPath: string): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    await this.ensureInitialized();

    if (!this.git) {
      throw new Error('Git not initialized');
    }

    try {
      // Clone repository using isomorphic-git
      const authToken = token;
      const onAuth = () => ({ username: authToken });

      await this.git.clone({
        fs: this.fs,
        http: {
          request: async (request: any) => {
            // Handle HTTP requests for git operations
            const response = await fetch(request.url, {
              method: request.method,
              headers: {
                ...request.headers,
                'Authorization': `Bearer ${authToken}`,
              },
              body: request.body,
            });

            return {
              url: response.url,
              method: response.statusText,
              headers: Object.fromEntries(response.headers),
              body: [await response.arrayBuffer()],
            };
          },
        },
        dir: localPath,
        url,
        onAuth,
      });

      this.currentRepository = url;
    } catch (error) {
      console.error('Failed to clone repository:', error);
      throw error;
    }
  }

  async getCurrentRepository(): Promise<string | null> {
    return this.currentRepository;
  }

  async setCurrentRepository(repoUrl: string): Promise<void> {
    this.currentRepository = repoUrl;
  }

  /**
   * Git operations
   */
  async commitFile(filePath: string, content: string, message: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.git || !this.currentRepository) {
      throw new Error('Git not initialized or no repository selected');
    }

    try {
      const dir = '/git/repo';

      // Write file
      await this.fs.writeFile(`${dir}/${filePath}`, content, 'utf8');

      // Stage file
      await this.git.add({
        fs: this.fs,
        dir,
        filepath: filePath,
      });

      // Create commit
      const author = await this.getCurrentUser();
      const authorName = author?.name || 'Illusions User';
      const authorEmail = author?.email || 'user@illusions.local';

      const sha = await this.git.commit({
        fs: this.fs,
        dir,
        message,
        author: {
          name: authorName,
          email: authorEmail,
        },
      });

      return sha;
    } catch (error) {
      console.error('Failed to commit file:', error);
      throw error;
    }
  }

  async pushChanges(): Promise<void> {
    await this.ensureInitialized();

    if (!this.git || !this.currentRepository) {
      throw new Error('Git not initialized or no repository selected');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const dir = '/git/repo';

      await this.git.push({
        fs: this.fs,
        http: {
          request: async (request: any) => {
            const response = await fetch(request.url, {
              method: request.method,
              headers: {
                ...request.headers,
                'Authorization': `Bearer ${token}`,
              },
              body: request.body,
            });

            return {
              url: response.url,
              method: response.statusText,
              headers: Object.fromEntries(response.headers),
              body: [await response.arrayBuffer()],
            };
          },
        },
        dir,
        remote: 'origin',
        branch: 'main',
        onAuth: () => ({ username: token }),
      });
    } catch (error) {
      console.error('Failed to push changes:', error);
      throw error;
    }
  }

  async pullChanges(): Promise<PullResult> {
    // TODO: Implement pull with conflict detection
    return {
      success: false,
      fastForward: false,
      conflicts: [],
      error: 'Pull requires implementation',
    };
  }

  async getStatus(): Promise<GitStatus> {
    // TODO: Implement status check
    return {
      clean: false,
      branch: 'main',
      behind: 0,
      ahead: 0,
      modified: [],
      untracked: [],
    };
  }

  async getCommitHistory(limit: number = 10): Promise<GitCommit[]> {
    // TODO: Implement commit history retrieval
    return [];
  }

  async getRemoteUrl(): Promise<string | null> {
    return this.currentRepository || null;
  }

  /**
   * Conflict resolution
   */
  async resolveConflict(
    filePath: string,
    resolution: 'ours' | 'theirs' | 'manual',
    content?: string
  ): Promise<void> {
    // TODO: Implement conflict resolution
    console.warn('Conflict resolution requires implementation');
  }

  async getConflicts(): Promise<ConflictInfo[]> {
    // TODO: Implement conflict detection
    return [];
  }

  /**
   * Helper methods
   */
  private async getAccessToken(): Promise<string | null> {
    const oauth = getWebOAuth();
    return oauth.getAccessToken();
  }
}

/**
 * Create Web Git Storage instance
 */
export async function createWebGitStorage(dbName?: string): Promise<WebGitStorage> {
  return new WebGitStorage(dbName);
}
