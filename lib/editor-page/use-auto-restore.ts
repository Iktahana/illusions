import { useEffect, useRef } from "react";

interface UseAutoRestoreParams {
  autoRestoreProjectId: string | null;
  isElectron: boolean;
  isAutoRestoringRef: React.MutableRefObject<boolean>;
  setIsRestoring: React.Dispatch<React.SetStateAction<boolean>>;
  setRestoreError: React.Dispatch<React.SetStateAction<string | null>>;
  signalVfsReady: () => void;
  handleOpenRecentProject: (projectId: string) => Promise<void>;
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

    let timerId: ReturnType<typeof setTimeout> | undefined;
    isAutoRestoringRef.current = true;
    void (async () => {
      try {
        await handleOpenRecentProject(autoRestoreProjectId);
      } catch {
        // handleOpenRecentProject catches its own errors internally
      }
      isAutoRestoringRef.current = false;
      signalVfsReady();
      timerId = setTimeout(() => {
        setIsRestoring((prev) => {
          if (prev && isElectron) {
            setRestoreError(
              "前回のプロジェクトを開けませんでした。フォルダが移動または削除された可能性があります。",
            );
          }
          return false;
        });
      }, 200);
    })();

    return () => {
      if (timerId !== undefined) clearTimeout(timerId);
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
