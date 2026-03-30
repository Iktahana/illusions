"use client";

import type React from "react";
import { EyeOff, Info, Lightbulb } from "lucide-react";
import clsx from "clsx";

import { LINT_RULES_META } from "@/lib/linting/lint-presets";
import InfoTooltip from "./InfoTooltip";

import type { LintIssue, Severity } from "@/lib/linting";
import type { EnrichedLintIssue } from "./types";

// -----------------------------------------------------------------------
// Shared constants (used by both IssueCard and CorrectionsPanel)
// -----------------------------------------------------------------------

export const SEVERITY_LABELS: Record<Severity, string> = {
  error: "エラー",
  warning: "警告",
  info: "情報",
};

/** Returns the display color class for a severity level */
export function severityColor(severity: Severity): string {
  switch (severity) {
    case "error":
      return "bg-error";
    case "warning":
      return "bg-warning";
    case "info":
      return "bg-info";
  }
}

/** Get rule display name from metadata */
export function getRuleName(ruleId: string): string {
  const meta = LINT_RULES_META.find(r => r.id === ruleId);
  return meta?.nameJa ?? ruleId;
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export interface IssueCardProps {
  issue: LintIssue | EnrichedLintIssue;
  isActive: boolean;
  onNavigateToIssue?: (issue: LintIssue) => void;
  onApplyFix?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
}

/** Renders a single issue card */
export default function IssueCard({
  issue,
  isActive,
  onNavigateToIssue,
  onApplyFix,
  onIgnoreCorrection,
}: IssueCardProps): React.JSX.Element {
  const enriched = issue as EnrichedLintIssue;
  const hasOriginal = !!enriched.originalText;
  const hasFix = !!issue.fix;

  return (
    <div
      className={clsx(
        "relative rounded-lg border transition-colors",
        isActive
          ? "border-accent bg-accent/5"
          : "border-border bg-background-secondary hover:border-border-secondary"
      )}
    >
      {/* Actions: top-right corner, absolutely positioned to avoid overlapping button */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
        <InfoTooltip
          content={`${issue.messageJa}${issue.reference ? `\n${issue.reference.standard}${issue.reference.section ? ` ${issue.reference.section}` : ""}` : ""}\n[${getRuleName(issue.ruleId)}]`}
          className="text-foreground-tertiary hover:text-foreground-secondary"
        >
          <Info className="w-3.5 h-3.5" />
        </InfoTooltip>
        {hasFix && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onApplyFix?.(issue);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onApplyFix?.(issue);
              }
            }}
            className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-accent hover:text-accent-hover bg-accent/10 hover:bg-accent/20 rounded transition-colors cursor-pointer"
          >
            置換
          </span>
        )}
        {onIgnoreCorrection && (
          <InfoTooltip
            content="この指摘を無視（右クリックで同じ指摘をすべて無視）"
            className="text-foreground-tertiary hover:text-foreground-secondary"
          >
            <span
              role="button"
              tabIndex={0}
              aria-label="この指摘を無視"
              onClick={(e) => {
                e.stopPropagation();
                onIgnoreCorrection(issue, false);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onIgnoreCorrection(issue, true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onIgnoreCorrection(issue, false);
                }
              }}
              className="inline-flex items-center p-0.5 rounded transition-colors cursor-pointer hover:bg-hover"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </span>
          </InfoTooltip>
        )}
      </div>
      {/* Main row: click to navigate */}
      <button
        type="button"
        onClick={() => onNavigateToIssue?.(issue)}
        className="w-full text-left px-3 py-2 pr-14"
      >
        <div className="flex items-start gap-2">
          {/* Severity dot + validation spinner */}
          <span className="relative shrink-0 mt-1.5 w-2 h-2">
            <span
              className={clsx(
                "w-2 h-2 rounded-full block",
                severityColor(issue.severity)
              )}
              title={SEVERITY_LABELS[issue.severity]}
            />
          </span>
          {/* Content: original → replacement or just message */}
          <div className="flex-1 min-w-0">
            {hasOriginal && hasFix ? (
              <p className="text-sm text-foreground leading-snug">
                <span className="text-foreground-tertiary line-through">{enriched.originalText}</span>
                <span className="text-foreground-tertiary mx-1">→</span>
                <span className="text-foreground font-medium">{issue.fix!.replacement}</span>
              </p>
            ) : hasOriginal ? (
              <p className="text-sm text-foreground leading-snug">
                {enriched.originalText}
              </p>
            ) : (
              <p className="text-sm text-foreground leading-snug flex items-start gap-1">
                <Lightbulb className="w-3.5 h-3.5 text-foreground-tertiary shrink-0 mt-0.5" />
                {issue.messageJa}
              </p>
            )}
            {/* Secondary line: show message when we have original text but no fix */}
            {hasOriginal && !hasFix && (
              <p className="text-xs text-foreground-tertiary mt-0.5 flex items-start gap-1">
                <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
                {issue.messageJa}
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
