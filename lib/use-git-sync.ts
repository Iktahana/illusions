/**
 * Git Sync Hook
 * 
 * Extends useMdiFile functionality with Git synchronization.
 * Handles automatic commits and pushes with configurable intervals.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { IGitStorageService, GitSyncState } from './git/git-storage-types';
import { getGitStorageService } from './git/git-storage-service';

/**
 * Git sync configuration
 */
export interface GitSyncConfig {
  enabled: boolean;
  autoCommitInterval?: number; // ms between auto-commits (default: 2000)
  autoPushDelay?: number; // ms to wait before auto-push after commit (default: 30000)
  onStatusChange?: (status: GitSyncState) => void;
}

/**
 * Git sync state management
 */
interface GitSyncInternalState {
  service: IGitStorageService | null;
  lastCommitTime: number;
  pendingCommits: number;
  pushTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Hook for Git synchronization
 */
export function useGitSync(config: GitSyncConfig) {
  const [syncState, setSyncState] = useState<GitSyncState>({
    isAuthenticated: false,
    syncStatus: 'idle',
    pendingCommits: 0,
  });

  const stateRef = useRef<GitSyncInternalState>({
    service: null,
    lastCommitTime: 0,
    pendingCommits: 0,
    pushTimer: null,
  });

  /**
   * Initialize Git service
   */
  useEffect(() => {
    if (!config.enabled) return;

    const initializeGitService = async () => {
      try {
        const service = await getGitStorageService();
        stateRef.current.service = service;

        // Check authentication status
        const isAuthenticated = await service.isAuthenticated();
        const user = isAuthenticated ? await service.getCurrentUser() : null;

        setSyncState((prev) => ({
          ...prev,
          isAuthenticated,
          currentUser: user || undefined,
        }));

        if (config.onStatusChange) {
          config.onStatusChange({
            ...syncState,
            isAuthenticated,
            currentUser: user || undefined,
          });
        }
      } catch (error) {
        console.error('Failed to initialize Git service:', error);
        setSyncState((prev) => ({
          ...prev,
          syncStatus: 'error',
          lastError: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    };

    initializeGitService();
  }, [config.enabled, config.onStatusChange]);

  /**
   * Auto-commit when file changes
   */
  const autoCommit = useCallback(
    async (filePath: string, content: string, message: string) => {
      if (!config.enabled || !stateRef.current.service) {
        return;
      }

      const now = Date.now();
      const timeSinceLastCommit = now - stateRef.current.lastCommitTime;
      const interval = config.autoCommitInterval || 2000;

      // Throttle commits
      if (timeSinceLastCommit < interval) {
        return;
      }

      try {
        setSyncState((prev) => ({
          ...prev,
          syncStatus: 'syncing',
        }));

        const sha = await stateRef.current.service!.commitFile(
          filePath,
          content,
          message || `Auto-save: ${new Date().toISOString()}`
        );

        stateRef.current.lastCommitTime = now;
        stateRef.current.pendingCommits += 1;

        setSyncState((prev) => ({
          ...prev,
          syncStatus: 'idle',
          pendingCommits: prev.pendingCommits + 1,
          lastSyncTime: now,
        }));

        // Schedule push after delay
        scheduleAutoPush();
      } catch (error) {
        console.error('Auto-commit failed:', error);
        setSyncState((prev) => ({
          ...prev,
          syncStatus: 'error',
          lastError: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    },
    [config]
  );

  /**
   * Auto-push commits
   */
  const autoPush = useCallback(async () => {
    if (!config.enabled || !stateRef.current.service || stateRef.current.pendingCommits === 0) {
      return;
    }

    try {
      setSyncState((prev) => ({
        ...prev,
        syncStatus: 'syncing',
      }));

      await stateRef.current.service.pushChanges();

      stateRef.current.pendingCommits = 0;

      setSyncState((prev) => ({
        ...prev,
        syncStatus: 'synced',
        pendingCommits: 0,
        lastSyncTime: Date.now(),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Auto-push failed:', errorMessage);

      // Check if it's a network error
      if (errorMessage.includes('network') || errorMessage.includes('offline')) {
        setSyncState((prev) => ({
          ...prev,
          syncStatus: 'offline',
        }));
      } else if (errorMessage.includes('conflict')) {
        setSyncState((prev) => ({
          ...prev,
          syncStatus: 'conflict',
        }));
      } else {
        setSyncState((prev) => ({
          ...prev,
          syncStatus: 'error',
          lastError: errorMessage,
        }));
      }
    }
  }, [config]);

  /**
   * Schedule auto-push
   */
  const scheduleAutoPush = useCallback(() => {
    const delay = config.autoPushDelay || 30000;

    // Clear existing timer
    if (stateRef.current.pushTimer) {
      clearTimeout(stateRef.current.pushTimer);
    }

    // Schedule new push
    stateRef.current.pushTimer = setTimeout(() => {
      void autoPush();
    }, delay);
  }, [config.autoPushDelay, autoPush]);

  /**
   * Handle online/offline events
   */
  useEffect(() => {
    if (!config.enabled) return;

    const handleOnline = async () => {
      setSyncState((prev) => ({
        ...prev,
        syncStatus: 'syncing',
      }));

      if (stateRef.current.pendingCommits > 0) {
        await autoPush();
      } else {
        setSyncState((prev) => ({
          ...prev,
          syncStatus: 'synced',
        }));
      }
    };

    const handleOffline = () => {
      setSyncState((prev) => ({
        ...prev,
        syncStatus: 'offline',
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [config.enabled, autoPush]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (stateRef.current.pushTimer) {
        clearTimeout(stateRef.current.pushTimer);
      }
    };
  }, []);

  /**
   * Call onStatusChange when sync state changes
   */
  useEffect(() => {
    if (config.onStatusChange) {
      config.onStatusChange(syncState);
    }
  }, [syncState, config.onStatusChange]);

  return {
    syncState,
    autoCommit,
    autoPush,
    service: stateRef.current.service,
    login: async () => {
      if (!stateRef.current.service) return;
      const result = await stateRef.current.service.login();
      if (result.success) {
        setSyncState((prev) => ({
          ...prev,
          isAuthenticated: true,
          currentUser: result.user,
        }));
      }
      return result;
    },
    logout: async () => {
      if (!stateRef.current.service) return;
      await stateRef.current.service.logout();
      setSyncState((prev) => ({
        ...prev,
        isAuthenticated: false,
        currentUser: undefined,
      }));
    },
  };
}
