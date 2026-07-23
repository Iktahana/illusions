import { useEffect, useRef } from "react";
import { trackUsageEvent } from "@/lib/analytics/usage-events";

export const AUTO_RESTORE_TIMEOUT_MS = 10_000;

interface UseAutoRestoreParams {
  autoRestoreProjectId: string | null;
  isElectron: boolean;
  isAutoRestoringRef: React.MutableRefObject<boolean>;
  setIsRestoring: React.Dispatch<React.SetStateAction<boolean>>;
  setRestoreError: React.Dispatch<React.SetStateAction<string | null>>;
  signalVfsReady: () => void;
  handleOpenRecentProject: (projectId: string) => Promise<boolean>;
}

/**
 * Triggers auto-restore of the last opened project on startup.
 * Sets `isAutoRestoringRef` during the restore operation, then signals
 * VFS readiness and clears the loading state once complete.
 */
export function useAutoRestore({
  autoRestoreProjectId,
  isElectron,
  isAutoRestoringRef,
  setIsRestoring,
  setRestoreError,
  signalVfsReady,
  handleOpenRecentProject,
}: UseAutoRestoreParams): void {
  const autoRestoreTriggeredRef = useRef(false);

  useEffect(() => {
    if (!autoRestoreProjectId || autoRestoreTriggeredRef.current) return;
    autoRestoreTriggeredRef.current = true;

    let finishTimerId: ReturnType<typeof setTimeout> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    isAutoRestoringRef.current = true;
    void (async () => {
      let success = false;
      let timedOut = false;
      try {
        success = await Promise.race([
          handleOpenRecentProject(autoRestoreProjectId),
          new Promise<boolean>((resolve) => {
            timeoutId = setTimeout(() => {
              timedOut = true;
              resolve(false);
            }, AUTO_RESTORE_TIMEOUT_MS);
          }),
        ]);
      } catch {
        // handleOpenRecentProject catches its own errors internally
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      trackUsageEvent(success ? "project_auto_restore_completed" : "project_auto_restore_failed", {
        ...(success
          ? { restore_strategy: "recent" }
          : { reason: timedOut ? "timeout" : "unknown" }),
      });
      isAutoRestoringRef.current = false;
      signalVfsReady();
      finishTimerId = setTimeout(() => {
        setIsRestoring((prev) => {
          if (prev && isElectron && !success) {
            setRestoreError(
              timedOut
                ? "前回のプロジェクトの復元がタイムアウトしました。プロジェクトを開き直してください。"
                : "前回のプロジェクトを開けませんでした。フォルダが移動または削除された可能性があります。",
            );
          }
          return false;
        });
      }, 200);
    })();

    return () => {
      if (finishTimerId !== undefined) clearTimeout(finishTimerId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [
    autoRestoreProjectId,
    handleOpenRecentProject,
    isElectron,
    isAutoRestoringRef,
    signalVfsReady,
    setIsRestoring,
    setRestoreError,
  ]);
}
