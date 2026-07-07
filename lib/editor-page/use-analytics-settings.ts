/**
 * Usage analytics (Aptabase) settings hook — manages the consent AppState field.
 * Follows the same pattern as use-dict-settings.ts.
 */
import { useCallback, useState } from "react";
import { persistAppState } from "@/lib/storage/app-state-manager";

export interface AnalyticsSettings {
  usageAnalyticsConsent: boolean;
  errorReportingConsent: boolean;
}

export interface AnalyticsSettingsHandlers {
  handleUsageAnalyticsConsentChange: (value: boolean) => void;
  handleErrorReportingConsentChange: (value: boolean) => void;
}

export interface UseAnalyticsSettingsResult {
  analyticsSettings: AnalyticsSettings;
  analyticsHandlers: AnalyticsSettingsHandlers;
  applyPersistedAnalyticsSettings: (appState: Record<string, unknown>) => void;
}

export function useAnalyticsSettings(): UseAnalyticsSettingsResult {
  const [usageAnalyticsConsent, setUsageAnalyticsConsent] = useState(true);
  const [errorReportingConsent, setErrorReportingConsent] = useState(true);

  const applyPersistedAnalyticsSettings = useCallback((appState: Record<string, unknown>) => {
    if (typeof appState.usageAnalyticsConsent === "boolean") {
      setUsageAnalyticsConsent(appState.usageAnalyticsConsent);
    }
    if (typeof appState.errorReportingConsent === "boolean") {
      setErrorReportingConsent(appState.errorReportingConsent);
    }
  }, []);

  const handleUsageAnalyticsConsentChange = useCallback((value: boolean) => {
    setUsageAnalyticsConsent(value);
    void persistAppState({ usageAnalyticsConsent: value }).catch((e: unknown) =>
      console.error("プライバシー設定の保存に失敗しました", e),
    );
  }, []);

  const handleErrorReportingConsentChange = useCallback((value: boolean) => {
    setErrorReportingConsent(value);
    void persistAppState({
      errorReportingConsent: value,
      errorReportingConsentPromptedAt: new Date().toISOString(),
    }).catch((e: unknown) => console.error("プライバシー設定の保存に失敗しました", e));
  }, []);

  return {
    analyticsSettings: { usageAnalyticsConsent, errorReportingConsent },
    analyticsHandlers: { handleUsageAnalyticsConsentChange, handleErrorReportingConsentChange },
    applyPersistedAnalyticsSettings,
  };
}
