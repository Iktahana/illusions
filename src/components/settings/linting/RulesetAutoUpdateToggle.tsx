"use client";

import type React from "react";
import { useEffect, useState } from "react";

import { getStorageService } from "@/lib/storage/storage-service";
import { persistAppState } from "@/lib/storage/app-state-manager";
import SettingsField from "../primitives/SettingsField";
import SettingsToggle from "../primitives/SettingsToggle";

/**
 * 「校正ルールセットを自動更新する」トグル（Electron 専用）。
 *
 * AppState `rulesetAutoUpdate`（既定 true）を直接読み書きする自己完結コンポーネント。
 * 起動時チェック {@link ruleset-update-check} が同じキーを参照し、ON のとき更新を
 * 自動適用、OFF のとき手動トーストを出す。
 */
export default function RulesetAutoUpdateToggle({
  disabled,
}: {
  disabled?: boolean;
}): React.ReactElement {
  // 既定 ON。永続値が読めるまでは ON 表示（明示的 false のときだけ OFF）。
  const [autoUpdate, setAutoUpdate] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getStorageService()
      .loadAppState()
      .then((appState) => {
        if (cancelled) return;
        if (appState?.rulesetAutoUpdate === false) setAutoUpdate(false);
      })
      .catch(() => {
        // 読めない場合は既定（ON）のまま。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (value: boolean): void => {
    setAutoUpdate(value);
    void persistAppState({ rulesetAutoUpdate: value }).catch((e: unknown) =>
      console.error("校正ルールセット設定の保存に失敗しました", e),
    );
  };

  return (
    <SettingsField
      label="校正ルールセットを自動更新する"
      description="起動時に新しいバージョンが見つかった場合、自動でダウンロードして適用します"
      htmlFor="ruleset-auto-update"
      inline
    >
      <SettingsToggle
        id="ruleset-auto-update"
        checked={autoUpdate}
        onChange={handleChange}
        disabled={disabled}
      />
    </SettingsField>
  );
}
