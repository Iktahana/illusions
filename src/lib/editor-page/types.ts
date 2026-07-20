/** Shared types and utilities for editor-page hooks */

/** Count non-whitespace characters in a string */
export function chars(s: string): number {
  return s.replace(/\s/g, "").length;
}

/** Recent project entry for WelcomeScreen display */
export interface RecentProjectEntry {
  projectId: string;
  name: string;
  lastAccessedAt: number;
  rootDirName?: string;
}

/** Permission prompt state for re-opening a stored project */
export interface PermissionPromptState {
  projectName: string;
  handle: FileSystemDirectoryHandle;
  projectId: string;
}
