/** Shared types for editor-page hooks */

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
