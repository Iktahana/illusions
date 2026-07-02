import { useEffect, useRef } from "react";

import { notificationManager } from "@/lib/services/notification-manager";
import { fetchAppState, persistAppState } from "@/lib/storage/app-state-manager";

interface UseErrorReportingConsentToastParams {
  openPrivacySettings: () => void;
}

export function useErrorReportingConsentToast({
  openPrivacySettings,
}: UseErrorReportingConsentToastParams): void {
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    if (!window.electronAPI?.isElectron) return;
    shownRef.current = true;

    void fetchAppState()
      .then((appState) => {
        if (appState?.errorReportingConsentPromptedAt) return;

        notificationManager.showMessage(
          "品質向上のため、クラッシュ情報やエラー情報の送信にご協力ください。原稿本文・ファイル名・ファイルパスは送信されません。",
          {
            type: "info",
            duration: 0,
            actions: [
              {
                label: "OK",
                onClick: () => {
                  void persistAppState({
                    errorReportingConsent: true,
                    errorReportingConsentPromptedAt: new Date().toISOString(),
                  });
                },
              },
              {
                label: "設定",
                onClick: () => {
                  void persistAppState({
                    errorReportingConsentPromptedAt: new Date().toISOString(),
                  });
                  openPrivacySettings();
                },
              },
            ],
          },
        );
      })
      .catch((error: unknown) => {
        console.error("エラーレポート同意案内の表示に失敗しました", error);
      });
  }, [openPrivacySettings]);
}
