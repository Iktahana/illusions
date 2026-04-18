"use client";

import type React from "react";

import { useScrollSettings } from "@/contexts/EditorSettingsContext";
import { SelectField, SettingsSection, SliderField } from "./primitives";

type ScrollBehavior = "auto" | "mouse" | "trackpad";

const SCROLL_BEHAVIOR_OPTIONS: ReadonlyArray<{
  value: ScrollBehavior;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "自動検出",
    description: "入力の軸と粒度からマウス/トラックパッドを推定します",
  },
  {
    value: "mouse",
    label: "マウス優先",
    description: "常にマウスホイールとして処理します（縦回転→横スクロール）",
  },
  {
    value: "trackpad",
    label: "トラックパッド優先",
    description: "常にトラックパッドとして処理します（自然なスクロール方向を維持）",
  },
];

/**
 * Settings tab for vertical writing / scroll behavior.
 * Covers: scroll detection mode and scroll sensitivity.
 */
export default function VerticalSettingsTab(): React.ReactElement {
  const {
    verticalScrollBehavior,
    scrollSensitivity,
    onVerticalScrollBehaviorChange,
    onScrollSensitivityChange,
  } = useScrollSettings();

  return (
    <SettingsSection title="スクロールと縦書き">
      <SelectField<ScrollBehavior>
        label="スクロール動作"
        variant="radio-cards"
        value={verticalScrollBehavior}
        options={SCROLL_BEHAVIOR_OPTIONS}
        onChange={onVerticalScrollBehaviorChange}
      />

      <SliderField
        label="スクロール感度"
        value={scrollSensitivity}
        min={0.2}
        max={3.0}
        step={0.1}
        formatValue={(v) => `${v.toFixed(1)}x`}
        onChange={onScrollSensitivityChange}
      />
    </SettingsSection>
  );
}
