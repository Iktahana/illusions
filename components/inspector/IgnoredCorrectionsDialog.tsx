"use client";

import type React from "react";
import { useMemo } from "react";
import { X, RotateCcw } from "lucide-react";

import GlassDialog from "@/shared/ui/GlassDialog";
import { useIgnoredCorrectionsContext } from "@/contexts/IgnoredCorrectionsContext";
import { LINT_RULES_META } from "@/lib/linting/lint-presets";
import ClearIgnoredCorrectionsButton from "@/components/settings/linting/ClearIgnoredCorrectionsButton";

export interface IgnoredCorrectionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** ruleId → 日本語ルール名（内蔵ルールのみ。外部/不明は ruleId をそのまま表示）。 */
const RULE_NAME_MAP: ReadonlyMap<string, string> = new Map(
  LINT_RULES_META.map((r) => [r.id, r.nameJa]),
);

/**
 * Lists the corrections the user has chosen to ignore (and only those), letting
 * them restore individual entries or wipe the whole memory. Opened from the
 * "無視された指摘" link in the corrections inspector.
 */
export default function IgnoredCorrectionsDialog({
  isOpen,
  onClose,
}: IgnoredCorrectionsDialogProps): React.ReactElement | null {
  const ctx = useIgnoredCorrectionsContext();

  // Newest first — most recently ignored entries are the likeliest to revisit.
  const items = useMemo(
    () => (ctx ? [...ctx.items].sort((a, b) => b.addedAt - a.addedAt) : []),
    [ctx],
  );

  if (!ctx) return null;

  return (
    <GlassDialog
      isOpen={isOpen}
      onBackdropClick={onClose}
      ariaLabel="無視された指摘"
      panelClassName="mx-4 w-full max-w-md p-0 flex flex-col max-h-[70vh]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium text-foreground flex-1">
          無視された指摘
          {items.length > 0 && (
            <span className="ml-1.5 text-xs text-foreground-tertiary">{items.length}件</span>
          )}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="p-1 text-foreground-tertiary hover:text-foreground hover:bg-hover rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body — only the ignored entries, never the active ones */}
      <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-foreground-tertiary">
            無視された指摘はありません
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const ruleName = RULE_NAME_MAP.get(item.ruleId) ?? item.ruleId;
              return (
                <li
                  key={`${item.ruleId}-${item.text}-${item.context ?? ""}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hover transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">「{item.text}」</div>
                    <div className="text-[11px] text-foreground-tertiary truncate">
                      {ruleName}
                      {item.context && <span className="ml-1">・この箇所のみ</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => ctx.unignore(item.ruleId, item.text, item.context)}
                    className="flex items-center gap-1 text-xs px-2 py-1 text-foreground-secondary border border-border rounded hover:bg-hover hover:text-foreground transition-colors flex-shrink-0"
                    title="この指摘の無視を解除する"
                  >
                    <RotateCcw className="w-3 h-3" />
                    解除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer — bulk clear (same action as the settings page) */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-border">
          <ClearIgnoredCorrectionsButton />
        </div>
      )}
    </GlassDialog>
  );
}
