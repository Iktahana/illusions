"use client";

import type React from "react";
import clsx from "clsx";
import { useScrollSettings } from "@/contexts/EditorSettingsContext";

const SCROLL_BEHAVIORS = [
  {
    value: "auto" as const,
    label: "自動検出",
    description: "マウスとトラックパッドを自動的に判別します",
  },
  {
    value: "mouse" as const,
    label: "マウス優先",
    description: "常にマウスホイールとして処理します（縦回転→横スクロール）",
  },
  {
    value: "trackpad" as const,
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
    <div className="space-y-6">
      {/* Scroll behavior */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">スクロール動作</h3>
        <div className="space-y-2">
          {SCROLL_BEHAVIORS.map((behavior) => (
            <button
              key={behavior.value}
              onClick={() => onVerticalScrollBehaviorChange(behavior.value)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                verticalScrollBehavior === behavior.value
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-accent/50 hover:bg-hover",
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={clsx(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    verticalScrollBehavior === behavior.value
                      ? "border-accent"
                      : "border-border-secondary",
                  )}
                >
                  {verticalScrollBehavior === behavior.value && (
                    <div className="w-2 h-2 rounded-full bg-accent" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{behavior.label}</div>
                  <div className="text-xs text-foreground-tertiary">{behavior.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Scroll sensitivity */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          スクロール感度: {scrollSensitivity.toFixed(1)}x
        </label>
        <input
          type="range"
          min={0.2}
          max={3.0}
          step={0.1}
          value={scrollSensitivity}
          onChange={(e) => onScrollSensitivityChange(Number(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
}
