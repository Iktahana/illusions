"use client";

import { useState } from "react";

import { getPermissionManager } from "@/lib/services/permission-manager";
import { trackUsageEvent } from "@/lib/analytics/usage-events";
import GlassDialog from "@/shared/ui/GlassDialog";

interface PermissionPromptProps {
  isOpen: boolean;
  projectName: string;
  handle: FileSystemDirectoryHandle;
  onGranted: () => void;
  onDenied: () => void;
  source: "recent" | "auto_restore";
}

/**
 * Dialog component that asks the user to grant File System Access permissions.
 * ファイルシステムアクセス権限の付与をユーザーに求めるダイアログコンポーネント。
 */
export default function PermissionPrompt({
  isOpen,
  projectName,
  handle,
  onGranted,
  onDenied,
  source,
}: PermissionPromptProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 権限リクエストを実行する */
  async function handleGrant(): Promise<void> {
    trackUsageEvent("web_project_permission_requested", { source });
    setIsRequesting(true);
    setError(null);

    try {
      const permissionManager = getPermissionManager();
      const result = await permissionManager.requestWritePermission(handle);

      if (result.canWrite) {
        trackUsageEvent("web_project_permission_finished", { source, outcome: "granted" });
        onGranted();
      } else {
        trackUsageEvent("web_project_permission_finished", { source, outcome: "denied" });
        onDenied();
      }
    } catch (err) {
      trackUsageEvent("web_project_permission_finished", { source, outcome: "failed" });
      const message =
        err instanceof Error ? err.message : "権限の取得中に不明なエラーが発生しました。";
      setError(message);
    } finally {
      setIsRequesting(false);
    }
  }

  const handleCancel = (): void => {
    trackUsageEvent("web_project_permission_finished", { source, outcome: "cancelled" });
    onDenied();
  };

  return (
    <GlassDialog isOpen={isOpen} onBackdropClick={isRequesting ? undefined : handleCancel}>
      <h2 className="text-lg font-semibold text-foreground">アクセス許可が必要です</h2>
      <p className="mt-2 text-sm text-foreground-secondary">
        「{projectName}」のファイルにアクセスするには、ブラウザの許可が必要です。
      </p>
      <p className="mt-1 text-xs text-foreground-secondary">
        セキュリティのため、ブラウザはプロジェクトフォルダへのアクセスを確認します。
      </p>

      {error && (
        <p className="mt-3 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isRequesting}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-hover transition-colors disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleGrant}
          disabled={isRequesting}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {isRequesting ? "許可を確認中..." : "許可する"}
        </button>
      </div>
    </GlassDialog>
  );
}
