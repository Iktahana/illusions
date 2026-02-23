"use client";

import { ChevronUp, ChevronDown } from "lucide-react";
import clsx from "clsx";

import type { GuidelineId } from "@/lib/linting/correction-config";
import type { GuidelineLicense } from "@/lib/linting/guidelines";
import { GUIDELINES } from "@/lib/linting/guidelines";

/** All known guideline IDs in their canonical display order. */
const ALL_GUIDELINE_IDS: GuidelineId[] = [
  "novel-manuscript",
  "joyo-kanji-2010",
  "okurigana-1973",
  "gendai-kanazukai-1986",
  "gairai-1991",
  "koyo-bun-2022",
  "jis-x-4051",
  "kisha-handbook-14",
  "jtf-style-3",
  "jtca-style-3",
  "editors-rulebook",
];

interface GuidelineListProps {
  /** Ordered list of enabled guideline IDs (highest priority first). */
  guidelines: GuidelineId[];
  /** Called with the updated ordered list when the user changes priority or toggles a guideline. */
  onChange: (guidelines: GuidelineId[]) => void;
}

/**
 * Display label for a guideline license.
 */
function LicenseBadge({ license }: { license: GuidelineLicense }) {
  const styles: Record<GuidelineLicense, string> = {
    Public: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    Paid: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    "CC BY 4.0": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };
  const labels: Record<GuidelineLicense, string> = {
    Public: "公開",
    Paid: "有償",
    "CC BY 4.0": "CC BY 4.0",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0",
        styles[license],
      )}
    >
      {labels[license]}
    </span>
  );
}

/**
 * GuidelineList — shows all available guidelines as an ordered priority list.
 *
 * Guidelines present in `guidelines` prop are considered enabled (and ordered
 * by their position in that array, highest priority first). Guidelines absent
 * from the array are shown as disabled at the bottom.
 *
 * Reordering uses up/down arrow buttons (no external DnD dependency required).
 */
export default function GuidelineList({ guidelines, onChange }: GuidelineListProps) {
  const enabledSet = new Set(guidelines);

  /**
   * Build the full display order:
   * 1. Enabled guidelines in their current priority order.
   * 2. Disabled guidelines in canonical order (appended at the end).
   */
  const displayOrder: GuidelineId[] = [
    ...guidelines,
    ...ALL_GUIDELINE_IDS.filter((id) => !enabledSet.has(id)),
  ];

  const handleToggle = (id: GuidelineId) => {
    if (enabledSet.has(id)) {
      // Disable: remove from the enabled list
      onChange(guidelines.filter((g) => g !== id));
    } else {
      // Enable: append to the end of the enabled list
      onChange([...guidelines, id]);
    }
  };

  const handleMoveUp = (id: GuidelineId) => {
    const idx = guidelines.indexOf(id);
    if (idx <= 0) return;
    const next = [...guidelines];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  };

  const handleMoveDown = (id: GuidelineId) => {
    const idx = guidelines.indexOf(id);
    if (idx < 0 || idx >= guidelines.length - 1) return;
    const next = [...guidelines];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  };

  return (
    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
      {displayOrder.map((id, displayIdx) => {
        const meta = GUIDELINES[id];
        const isEnabled = enabledSet.has(id);
        const enabledIdx = guidelines.indexOf(id);
        const isFirst = enabledIdx === 0;
        const isLast = enabledIdx === guidelines.length - 1;

        return (
          <div
            key={id}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 transition-colors",
              isEnabled ? "bg-background" : "bg-background-tertiary/40 opacity-60",
              displayIdx === 0 && "rounded-t-lg",
            )}
          >
            {/* Priority reorder buttons (only for enabled guidelines) */}
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button
                onClick={() => handleMoveUp(id)}
                disabled={!isEnabled || isFirst}
                className={clsx(
                  "p-0.5 rounded transition-colors",
                  isEnabled && !isFirst
                    ? "text-foreground-secondary hover:text-foreground hover:bg-hover"
                    : "text-foreground-muted cursor-not-allowed",
                )}
                aria-label="優先度を上げる"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleMoveDown(id)}
                disabled={!isEnabled || isLast}
                className={clsx(
                  "p-0.5 rounded transition-colors",
                  isEnabled && !isLast
                    ? "text-foreground-secondary hover:text-foreground hover:bg-hover"
                    : "text-foreground-muted cursor-not-allowed",
                )}
                aria-label="優先度を下げる"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Priority rank badge */}
            <span
              className={clsx(
                "text-[10px] font-mono w-4 text-center flex-shrink-0",
                isEnabled ? "text-foreground-tertiary" : "text-foreground-muted",
              )}
            >
              {isEnabled ? String(enabledIdx + 1) : "—"}
            </span>

            {/* Guideline info */}
            <div className="flex-1 min-w-0">
              <span
                className={clsx(
                  "text-sm block truncate",
                  isEnabled ? "text-foreground" : "text-foreground-tertiary",
                )}
              >
                {meta.nameJa}
              </span>
              <span className="text-[10px] text-foreground-tertiary block truncate">
                {meta.publisherJa}
                {meta.year !== null ? `　${meta.year}` : ""}
              </span>
            </div>

            {/* License badge */}
            <LicenseBadge license={meta.license} />

            {/* Enable/disable toggle */}
            <button
              onClick={() => handleToggle(id)}
              className={clsx(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
                isEnabled ? "bg-accent" : "bg-foreground-muted",
              )}
              aria-label={isEnabled ? "ガイドラインを無効にする" : "ガイドラインを有効にする"}
            >
              <span
                className={clsx(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm",
                  isEnabled ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
