"use client";

import type React from "react";

import { useAnalyticsSettings } from "@/contexts/EditorSettingsContext";
import { SettingsField, SettingsSection, SettingsToggle } from "./primitives";

/**
 * Settings tab for privacy / usage analytics consent (Electron only).
 */
export default function PrivacySettingsTab(): React.ReactElement {
  const {
    usageAnalyticsConsent,
    errorReportingConsent,
    onUsageAnalyticsConsentChange,
    onErrorReportingConsentChange,
  } = useAnalyticsSettings();

  return (
    <div className="space-y-6">
      <SettingsSection
        title="使用統計"
        description="どの機能がよく使われているかを把握し、今後の改善に活かすため、匿名の使用統計を送信します。本文・ファイル名・ファイルパス・検索文字列など、内容に関わる情報は一切含まれません。"
      >
        <SettingsField label="匿名の使用統計を送信する" htmlFor="usage-analytics-consent" inline>
          <SettingsToggle
            id="usage-analytics-consent"
            checked={usageAnalyticsConsent ?? true}
            onChange={(next) => onUsageAnalyticsConsentChange?.(next)}
          />
        </SettingsField>

        <div className="text-xs text-foreground-secondary space-y-1">
          <p>・送信されるのは起動回数や機能利用状況などの匿名データのみです</p>
          <p>・いつでもオフに切り替えられます</p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="エラーレポート"
        description="品質向上のため、クラッシュ情報やエラー情報を送信します。送信されるのはエラーの種類・発生箇所・アプリバージョン・OS 情報のみです。原稿本文・ファイル名・ファイルパス・検索文字列は送信されません。"
      >
        <SettingsField label="エラーレポートを送信する" htmlFor="error-reporting-consent" inline>
          <SettingsToggle
            id="error-reporting-consent"
            checked={errorReportingConsent ?? true}
            onChange={(next) => onErrorReportingConsentChange?.(next)}
          />
        </SettingsField>

        <div className="text-xs text-foreground-secondary space-y-1">
          <p>・送信されるのはエラーの種類、発生箇所、アプリバージョン、OS 情報です</p>
          <p>・原稿本文・ファイル名・ファイルパス・検索文字列は送信されません</p>
        </div>
      </SettingsSection>
    </div>
  );
}
