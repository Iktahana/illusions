"use client";

import type React from "react";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import clsx from "clsx";

import type { RuleLevel, Severity } from "@/lib/linting/types";
import { getRuleLevelMap } from "@/lib/linting/rule-registry";
import SourceBadge from "./SourceBadge";
import type { SourceType } from "./SourceBadge";
import RuleRow from "./RuleRow";
import type { RuleConfig } from "./RuleRow";
import ToggleSwitch from "./ToggleSwitch";
import LicenseBadge from "./LicenseBadge";

export interface RulesetCardRule {
  ruleId: string;
  nameJa: string;
  level?: RuleLevel;
  supportsSkipDialogue?: boolean;
  /**
   * Manifest default of the rule's `includeVerbsAdjectives` option;
   * `undefined` = the rule does not declare it (no sub-toggle). See RuleRow.
   */
  includeVerbsAdjectivesDefault?: boolean;
}

export interface RulesetCardProps {
  id: string;
  nameJa: string;
  source: SourceType;
  version?: string | null;
  tag?: string | null;
  /** Author / publisher (出典の著者・発行元), shown dimmed after the title. */
  publisherJa?: string;
  /** License name from manifest meta (e.g. "CC BY 4.0", "書籍（要購入）"). */
  license?: string;
  /** Optional link to the license text. */
  licenseUrl?: string;
  /** Optional purchase link for commercial physical-book rulesets. */
  purchaseUrl?: string;
  rules: RulesetCardRule[];
  updateAvailable?: boolean;
  syncing?: boolean;
  error?: string | null;
  /** If true, delete button is disabled (built-in and official packs) */
  deletable?: boolean;
  /** Config keyed by ruleId */
  ruleConfigs: Record<string, RuleConfig>;
  defaultConfigs?: Record<string, { enabled: boolean; severity: Severity }>;
  disabled?: boolean;
  onRuleConfigChange: (ruleId: string, config: RuleConfig) => void;
  onPackToggle: (ruleIds: string[], enabled: boolean) => void;
  onCheckUpdate?: () => Promise<void>;
  onRedownload?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

const LEGACY_LEVEL_MAP: ReadonlyMap<string, RuleLevel> | null = (() => {
  try {
    return getRuleLevelMap();
  } catch {
    return null;
  }
})();

function getEffectiveConfig(
  ruleId: string,
  configs: Record<string, RuleConfig>,
  defaults?: Record<string, { enabled: boolean; severity: Severity }>,
): RuleConfig {
  return (
    configs[ruleId] ??
    (defaults?.[ruleId]
      ? { enabled: defaults[ruleId].enabled, severity: defaults[ruleId].severity }
      : { enabled: true, severity: "warning" })
  );
}

export default function RulesetCard({
  nameJa,
  source,
  version,
  tag,
  publisherJa,
  license,
  licenseUrl,
  purchaseUrl,
  rules,
  updateAvailable,
  syncing,
  error,
  deletable = false,
  ruleConfigs,
  defaultConfigs,
  disabled,
  onRuleConfigChange,
  onPackToggle,
  onCheckUpdate,
  onRedownload,
  onDelete,
}: RulesetCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  const ruleIds = rules.map((r) => r.ruleId);
  const enabledCount = ruleIds.filter(
    (rid) => getEffectiveConfig(rid, ruleConfigs, defaultConfigs).enabled,
  ).length;
  const allEnabled = ruleIds.length > 0 && enabledCount === ruleIds.length;
  const partiallyEnabled = enabledCount > 0 && enabledCount < ruleIds.length;

  const handleAction = async (fn: () => Promise<void>): Promise<void> => {
    setActionInProgress(true);
    try {
      await fn();
    } finally {
      setActionInProgress(false);
    }
  };

  const controlsDisabled = disabled || syncing || actionInProgress;

  return (
    <div
      className={clsx(
        "border border-border rounded-lg overflow-hidden transition-opacity",
        controlsDisabled && !error && "opacity-70",
      )}
    >
      {/* Card header — 2 段構成。タイトル行は折り返さず name を truncate、
          メタチップ（出典・ライセンス・購入）は別行で flex-wrap させて
          横並びの混雑による折り返し崩れ（「更新あり」の文字割れ等）を防ぐ。 */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-background-tertiary/50">
        {/* 左カラム: タイトル行 + メタ行 */}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {/* タイトル行: 展開ボタン（chevron + name）+ 更新あり + 同期スピナー */}
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 min-w-0 text-left"
              aria-expanded={expanded}
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-foreground-tertiary flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-foreground-tertiary flex-shrink-0" />
              )}
              <span className="text-sm font-medium text-foreground truncate">{nameJa}</span>
            </button>
            {updateAvailable && (
              <span className="text-[10px] font-medium text-warning bg-warning/10 border border-warning/30 px-1.5 py-0.5 rounded leading-none flex-shrink-0 whitespace-nowrap">
                更新あり
              </span>
            )}
            {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent flex-shrink-0" />}
          </div>

          {/* メタ行: 出典 + 各種バッジ。chevron 幅ぶん字下げして name と揃える。
              購入リンク（<a>）はボタン外に出し、不正な入れ子とクリック競合を回避。 */}
          {(publisherJa || source || license) && (
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap pl-5">
              {publisherJa && (
                <span className="text-xs text-foreground/50 whitespace-nowrap">{publisherJa}</span>
              )}
              <SourceBadge source={source} />
              <LicenseBadge license={license} licenseUrl={licenseUrl} purchaseUrl={purchaseUrl} />
            </div>
          )}
        </div>

        {/* Version */}
        {(version || tag) && (
          <span className="text-[10px] text-foreground-tertiary flex-shrink-0 hidden sm:block">
            {version ?? tag}
          </span>
        )}

        {/* Enabled count */}
        <span className="text-xs text-foreground-tertiary flex-shrink-0">
          {enabledCount}/{ruleIds.length}
        </span>

        {/* Pack-level tri-state toggle: off / partial / all-on. Clicking while
            off or partial enables all; clicking while all-on disables all. */}
        <ToggleSwitch
          checked={allEnabled}
          indeterminate={partiallyEnabled}
          onChange={() => onPackToggle(ruleIds, !allEnabled)}
          disabled={controlsDisabled}
          ariaLabel={allEnabled ? "このパックを無効にする" : "このパックを有効にする"}
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-danger/5 border-t border-border text-xs text-danger">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 min-w-0 truncate">{error}</span>
          {onRedownload && (
            <button
              onClick={() => void handleAction(onRedownload)}
              disabled={actionInProgress}
              className="text-xs underline hover:no-underline flex-shrink-0"
            >
              再ダウンロード
            </button>
          )}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <>
          {/* Action row (Electron only — caller passes handlers only when in Electron) */}
          {(onCheckUpdate || onRedownload || onDelete) && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-background">
              {onCheckUpdate && (
                <button
                  onClick={() => void handleAction(onCheckUpdate)}
                  disabled={controlsDisabled}
                  className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-3 h-3" />
                  更新を確認
                </button>
              )}
              {onRedownload && (
                <button
                  onClick={() => void handleAction(onRedownload)}
                  disabled={controlsDisabled}
                  className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" />
                  再ダウンロード
                </button>
              )}
              <div className="flex-1" />
              {/* Delete button — always rendered but disabled for official/built-in */}
              <div
                className="relative"
                title={!deletable ? "内蔵推奨ルールセットは削除できません" : undefined}
              >
                <button
                  onClick={deletable && onDelete ? () => void handleAction(onDelete) : undefined}
                  disabled={!deletable || controlsDisabled}
                  className={clsx(
                    "flex items-center gap-1 text-xs px-2 py-1 border border-border rounded transition-colors",
                    deletable
                      ? "hover:bg-danger/10 hover:border-danger/50 hover:text-danger disabled:opacity-50 disabled:cursor-not-allowed"
                      : "opacity-40 cursor-not-allowed",
                  )}
                  aria-disabled={!deletable}
                >
                  <Trash2 className="w-3 h-3" />
                  削除
                </button>
              </div>
            </div>
          )}

          {/* Sync progress */}
          {syncing && (
            <div className="px-3 py-2 border-t border-border">
              <div className="flex items-center justify-between text-xs text-foreground-secondary mb-1">
                <span>同期中...</span>
              </div>
              <div className="w-full bg-background rounded-full h-1.5">
                <div className="bg-accent h-1.5 rounded-full animate-pulse w-1/2" />
              </div>
            </div>
          )}

          {/* Rules list */}
          {rules.length > 0 ? (
            <div className="divide-y divide-border border-t border-border">
              {rules.map((rule) => {
                const level =
                  rule.level !== undefined
                    ? (rule.level as RuleLevel)
                    : (LEGACY_LEVEL_MAP?.get(rule.ruleId) ?? undefined);
                const config = getEffectiveConfig(rule.ruleId, ruleConfigs, defaultConfigs);
                return (
                  <RuleRow
                    key={rule.ruleId}
                    ruleId={rule.ruleId}
                    nameJa={rule.nameJa}
                    level={level}
                    supportsSkipDialogue={rule.supportsSkipDialogue}
                    includeVerbsAdjectivesDefault={rule.includeVerbsAdjectivesDefault}
                    config={config}
                    onChange={onRuleConfigChange}
                  />
                );
              })}
            </div>
          ) : (
            !error && (
              <div className="px-3 py-4 text-xs text-foreground-tertiary border-t border-border text-center">
                ルールがありません
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
