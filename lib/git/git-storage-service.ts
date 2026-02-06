/**
 * Git Storage Service Factory
 * 
 * Creates and manages Git storage service instances.
 * Provides platform detection and service initialization.
 */

import { IGitStorageService, GitStorageConfig } from './git-storage-types';

/**
 * Detect if running in Electron
 */
function isElectron(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return !!(window as any).electronAPI;
}

/**
 * Detect platform type
 */
function detectPlatform(): 'electron' | 'web' {
  return isElectron() ? 'electron' : 'web';
}

/**
 * Factory function to create Git storage service
 * Automatically detects platform and creates appropriate implementation
 */
export async function createGitStorageService(
  config?: Partial<GitStorageConfig>
): Promise<IGitStorageService> {
  const platform = detectPlatform();

  // Import implementations dynamically to avoid circular dependencies
  if (platform === 'electron') {
    // Electron implementation - will be created in Phase 2
    // For now, return a placeholder
    return createPlaceholderService();
  } else {
    // Web implementation - will be created in Phase 2
    // For now, return a placeholder
    return createPlaceholderService();
  }
}

/**
 * Placeholder service for Phase 1
 * Implements minimal IGitStorageService interface
 */
function createPlaceholderService(): IGitStorageService {
  return {
    async login() {
      throw new Error('Git storage not yet initialized');
    },

    async logout() {
      throw new Error('Git storage not yet initialized');
    },

    async getCurrentUser() {
      return null;
    },

    async isAuthenticated() {
      return false;
    },

    async listRepositories() {
      return [];
    },

    async createRepository() {
      throw new Error('Git storage not yet initialized');
    },

    async cloneRepository() {
      throw new Error('Git storage not yet initialized');
    },

    async getCurrentRepository() {
      return null;
    },

    async setCurrentRepository() {
      throw new Error('Git storage not yet initialized');
    },

    async commitFile() {
      throw new Error('Git storage not yet initialized');
    },

    async pushChanges() {
      throw new Error('Git storage not yet initialized');
    },

    async pullChanges() {
      return {
        success: false,
        fastForward: false,
        conflicts: [],
        error: 'Git storage not yet initialized',
      };
    },

    async getStatus() {
      return {
        clean: false,
        branch: 'main',
        behind: 0,
        ahead: 0,
        modified: [],
        untracked: [],
      };
    },

    async getCommitHistory() {
      return [];
    },

    async getRemoteUrl() {
      return null;
    },

    async resolveConflict() {
      throw new Error('Git storage not yet initialized');
    },

    async getConflicts() {
      return [];
    },
  };
}

/**
 * Singleton instance
 */
let gitStorageInstance: IGitStorageService | null = null;

/**
 * Get or create the Git storage service instance
 */
export async function getGitStorageService(
  config?: Partial<GitStorageConfig>
): Promise<IGitStorageService> {
  if (!gitStorageInstance) {
    gitStorageInstance = await createGitStorageService(config);
  }
  return gitStorageInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetGitStorageService(): void {
  gitStorageInstance = null;
}
