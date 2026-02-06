/**
 * Sync Status Indicator Component
 * 
 * Displays real-time Git synchronization status with visual feedback.
 */

"use client";

import { GitSyncState } from "@/lib/git/git-storage-types";
import {
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Loader2,
  XCircle,
} from "lucide-react";

export interface SyncStatusIndicatorProps {
  syncState: GitSyncState;
}

export function SyncStatusIndicator({ syncState }: SyncStatusIndicatorProps) {
  const statusConfig = {
    idle: {
      icon: Cloud,
      label: "未同期",
      color: "text-gray-500",
      bg: "bg-gray-50 dark:bg-gray-900",
      borderColor: "border-gray-200 dark:border-gray-700",
      animate: false,
    },
    syncing: {
      icon: Loader2,
      label: "同期中...",
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      borderColor: "border-blue-200 dark:border-blue-800",
      animate: true,
    },
    synced: {
      icon: CheckCircle2,
      label: "同期済み",
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-900/20",
      borderColor: "border-green-200 dark:border-green-800",
      animate: false,
    },
    conflict: {
      icon: AlertTriangle,
      label: "競合あり",
      color: "text-red-500",
      bg: "bg-red-50 dark:bg-red-900/20",
      borderColor: "border-red-200 dark:border-red-800",
      animate: false,
    },
    offline: {
      icon: WifiOff,
      label: "オフライン",
      color: "text-orange-500",
      bg: "bg-orange-50 dark:bg-orange-900/20",
      borderColor: "border-orange-200 dark:border-orange-800",
      animate: false,
    },
    error: {
      icon: XCircle,
      label: "エラー",
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-900/20",
      borderColor: "border-red-200 dark:border-red-800",
      animate: false,
    },
  };

  const config = statusConfig[syncState.syncStatus];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.bg} ${config.borderColor} transition-colors`}
      title={`同期状態: ${config.label}`}
    >
      <Icon
        className={`w-4 h-4 ${config.color} ${
          config.animate ? "animate-spin" : ""
        }`}
      />
      <span className={`text-sm font-medium ${config.color}`}>
        {config.label}
      </span>

      {syncState.pendingCommits > 0 && (
        <span className="ml-1 px-2 py-0.5 text-xs font-semibold bg-red-500 text-white rounded-full">
          {syncState.pendingCommits}
        </span>
      )}

      {syncState.lastError && syncState.syncStatus === "error" && (
        <div className="absolute bottom-full left-0 mb-2 p-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
          {syncState.lastError}
        </div>
      )}
    </div>
  );
}

/**
 * Sync Status Details Panel
 */
export interface SyncStatusDetailsProps {
  syncState: GitSyncState;
}

export function SyncStatusDetails({ syncState }: SyncStatusDetailsProps) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-gray-600 dark:text-gray-400">状態:</span>
        <span className="font-medium text-gray-900 dark:text-white">
          {syncState.syncStatus}
        </span>
      </div>

      {syncState.currentUser && (
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">ユーザー:</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {syncState.currentUser.name || syncState.currentUser.login}
          </span>
        </div>
      )}

      {syncState.currentRepository && (
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">リポジトリ:</span>
          <span className="font-medium text-gray-900 dark:text-white truncate">
            {syncState.currentRepository}
          </span>
        </div>
      )}

      <div className="flex justify-between">
        <span className="text-gray-600 dark:text-gray-400">
          未プッシュ:
        </span>
        <span className="font-medium text-gray-900 dark:text-white">
          {syncState.pendingCommits} commits
        </span>
      </div>

      {syncState.lastSyncTime && (
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">最終同期:</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {new Date(syncState.lastSyncTime).toLocaleString("ja-JP")}
          </span>
        </div>
      )}

      {syncState.lastError && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-xs">
          {syncState.lastError}
        </div>
      )}
    </div>
  );
}
