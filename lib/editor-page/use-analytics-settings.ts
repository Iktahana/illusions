/**
 * Usage analytics (Aptabase) settings hook — manages the consent AppState field.
 * Follows the same pattern as use-dict-settings.ts.
 */
import { useCallback, useState } from "react";
import { persistAppState } from "@/lib/storage/app-state-manager";

export interface AnalyticsSettings {
  usageAnalyticsConsent: boolean;
}

export interface AnalyticsSettingsHandlers {
  handleUsageAnalyticsConsentChange: (value: boolean) => void;
}

export interface UseAnalyticsSettingsResult {
  analyticsSettings: AnalyticsSettings;
  analyticsHandlers: AnalyticsSettingsHandlers;
  applyPersistedAnalyticsSettings: (appState: Record<string, unknown>) => void;
}

export function useAnalyticsSettings(): UseAnalyticsSettingsResult {
  const [usageAnalyticsConsent, setUsageAnalyticsConsent] = useState(true);

  const applyPersistedAnalyticsSettings = useCallback((appState: Record<string, unknown>) => {
    if (typeof appState.usageAnalyticsConsent === "boolean") {
      setUsageAnalyticsConsent(appState.usageAnalyticsConsent);
    }
  }, []);

  const handleUsageAnalyticsConsentChange = useCallback((value: boolean) => {
    setUsageAnalyticsConsent(value);
    void persistAppState({ usageAnalyticsConsent: value }).catch((e: unknown) =>
      console.error("プライバシー設定の保存に失敗しました", e),
    );
  }, []);

  return {
    analyticsSettings: { usageAnalyticsConsent },
    analyticsHandlers: { handleUsageAnalyticsConsentChange },
    applyPersistedAnalyticsSettings,
  };
}
