/**
 * Git Operations Types
 * 
 * Type definitions for Git operations using isomorphic-git.
 */

export interface GitAuthor {
  name: string;
  email: string;
  timestamp?: number;
  timezoneOffset?: number;
}

export interface GitCommit {
  oid: string;
  message: string;
  author: GitAuthor;
  committer: GitAuthor;
  timestamp: number;
  parent?: string[];
}

export interface GitBranch {
  name: string;
  current: boolean;
  commitHash: string;
}

export interface GitTag {
  name: string;
  commitHash: string;
  message?: string;
  tagger?: GitAuthor;
}

export interface PullResult {
  ok: boolean;
  fetchHead?: string;
  hasConflicts: boolean;
  conflictedFiles?: string[];
}

export interface MergeResult {
  ok: boolean;
  hasConflicts: boolean;
  conflictedFiles?: string[];
}

export interface DiffResult {
  additions: number;
  deletions: number;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
  lineNumber?: number;
}

export interface SyncStatus {
  isActive: boolean;
  lastSync: number | null;
  lastPush: number | null;
  pendingCommits: number;
  isOnline: boolean;
  hasConflict: boolean;
  error: string | null;
}

export interface ConflictInfo {
  filepath: string;
  localContent: string;
  remoteContent: string;
  baseContent?: string;
}
