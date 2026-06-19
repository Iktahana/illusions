/**
 * Update settings hook — manages auto-update related AppState fields.
 * Follows the same pattern as use-dict-settings.ts.
 */
import { useCallback, useState } from "react";
import { persistAppState } from "@/lib/storage/app-state-manager";

export interface UpdateSettings {
  /** ベータ版（プレリリース）アップデートを受け取るか */
  allowBetaUpdates: boolean;
}

export interface UpdateSettingsHandlers {
  handleAllowBetaUpdatesChange: (value: boolean) => void;
}

export interface UseUpdateSettingsResult {
  updateSettings: UpdateSettings;
  updateHandlers: UpdateSettingsHandlers;
  applyPersistedUpdateSettings: (appState: Record<string, unknown>) => void;
}

export function useUpdateSettings(): UseUpdateSettingsResult {
  const [allowBetaUpdates, setAllowBetaUpdates] = useState(false);

  const applyPersistedUpdateSettings = useCallback((appState: Record<string, unknown>) => {
    if (typeof appState.allowBetaUpdates === "boolean") {
      setAllowBetaUpdates(appState.allowBetaUpdates);
    }
  }, []);

  const handleAllowBetaUpdatesChange = useCallback((value: boolean) => {
    setAllowBetaUpdates(value);
    void persistAppState({ allowBetaUpdates: value })
      .then(() => {
        // メインプロセスへ channel 再評価を通知（次回チェックを待たず即時反映）
        window.electronAPI?.reevaluateUpdateChannel?.();
      })
      .catch((e: unknown) => console.error("アップデート設定の保存に失敗しました", e));
  }, []);

  const updateSettings: UpdateSettings = {
    allowBetaUpdates,
  };

  const updateHandlers: UpdateSettingsHandlers = {
    handleAllowBetaUpdatesChange,
  };

  return { updateSettings, updateHandlers, applyPersistedUpdateSettings };
}
