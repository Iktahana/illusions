import { useEffect, useRef, useState } from "react";

interface UseSaveToastOptions {
  /** Timestamp of the last successful save, or null if never saved. */
  lastSavedTime: number | null;
  /** Whether the last save was triggered automatically (suppresses the toast). */
  lastSaveWasAuto: boolean;
}

interface UseSaveToastResult {
  /** Whether the save-complete toast is currently visible. */
  showSaveToast: boolean;
  /** Whether the toast is currently in its exit animation. */
  saveToastExiting: boolean;
}

/**
 * Manages the transient "保存完了" toast notification.
 *
 * The toast is shown only after a manual save (not auto-saves and not the
 * initial load). It auto-dismisses after 1200 ms with a 150 ms fade-out.
 */
export function useSaveToast({
  lastSavedTime,
  lastSaveWasAuto,
}: UseSaveToastOptions): UseSaveToastResult {
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastExiting, setSaveToastExiting] = useState(false);
  const prevLastSavedTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastSavedTime && prevLastSavedTimeRef.current !== lastSavedTime) {
      if (prevLastSavedTimeRef.current !== null) {
        // Only show toast for manual saves
        if (!lastSaveWasAuto) {
          setShowSaveToast(true);
          setSaveToastExiting(false);

          let exitTimer: ReturnType<typeof setTimeout> | null = null;
          const hideTimer = setTimeout(() => {
            setSaveToastExiting(true);
            exitTimer = setTimeout(() => {
              setShowSaveToast(false);
              setSaveToastExiting(false);
            }, 150);
          }, 1200);

          prevLastSavedTimeRef.current = lastSavedTime;
          return () => {
            clearTimeout(hideTimer);
            if (exitTimer) clearTimeout(exitTimer);
          };
        }
      }
      prevLastSavedTimeRef.current = lastSavedTime;
    }
  }, [lastSavedTime, lastSaveWasAuto]);

  return { showSaveToast, saveToastExiting };
}
