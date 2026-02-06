/**
 * Git Storage Service Type Definitions
 * 
 * Core interfaces and types for Git storage operations across
 * Electron and Web platforms using isomorphic-git.
 */

/**
 * GitHub user information from API
 */
export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  email: string | null;
}

/**
 * GitHub repository information
 */
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  html_url: string;
  description: string | null;
  private: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  clone_url: string;
  default_branch: string;
}

/**
 * Authentication result from OAuth flow
 */
export interface GitAuthResult {
  success: boolean;
  user?: GitHubUser;
  token?: string;
  error?: string;
}

/**
 * Git commit information
 */
export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  timestamp: number;
  parentSha?: string;
}

/**
 * Git repository status
 */
export interface GitStatus {
  clean: boolean;
  branch: string;
  behind: number;
  ahead: number;
  modified: string[];
  untracked: string[];
}

/**
 * Result from git pull operation
 */
export interface PullResult {
  success: boolean;
  fastForward: boolean;
  conflicts: ConflictInfo[];
  error?: string;
}

/**
 * Conflict information for merge conflicts
 */
export interface ConflictInfo {
  filePath: string;
  ours: string;
  theirs: string;
  base?: string;
}

/**
 * Main Git Storage Service interface
 * Provides unified API for both Electron and Web implementations
 */
export interface IGitStorageService {
  /**
   * Authentication
   */
  login(): Promise<GitAuthResult>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<GitHubUser | null>;
  isAuthenticated(): Promise<boolean>;

  /**
   * Repository operations
   */
  listRepositories(): Promise<GitHubRepository[]>;
  createRepository(name: string, isPrivate: boolean): Promise<GitHubRepository>;
  cloneRepository(url: string, localPath: string): Promise<void>;
  getCurrentRepository(): Promise<string | null>;
  setCurrentRepository(repoUrl: string): Promise<void>;

  /**
   * Git operations
   */
  commitFile(filePath: string, content: string, message: string): Promise<string>;
  pushChanges(): Promise<void>;
  pullChanges(): Promise<PullResult>;
  getStatus(): Promise<GitStatus>;
  getCommitHistory(limit?: number): Promise<GitCommit[]>;
  getRemoteUrl(): Promise<string | null>;

  /**
   * Conflict resolution
   */
  resolveConflict(filePath: string, resolution: 'ours' | 'theirs' | 'manual', content?: string): Promise<void>;
  getConflicts(): Promise<ConflictInfo[]>;
}

/**
 * Git synchronization state for AppState
 */
export interface GitSyncState {
  isAuthenticated: boolean;
  currentUser?: GitHubUser;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'conflict' | 'offline' | 'error';
  lastSyncTime?: number;
  currentRepository?: string;
  pendingCommits: number;
  lastError?: string;
}

/**
 * Factory configuration for creating Git storage service
 */
export interface GitStorageConfig {
  platform: 'electron' | 'web';
  dataPath?: string; // For Electron: app data path
  dbName?: string; // For Web: IndexedDB name
}
