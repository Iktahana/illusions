"use client";

import { useMemo, useCallback } from "react";
import { ExternalLink } from "lucide-react";
import clsx from "clsx";

import type { GuidelineId } from "@/lib/linting/correction-config";
import type { Guideline, GuidelineLicense } from "@/lib/linting/guidelines";
import { GUIDELINES } from "@/lib/linting/guidelines";

/** Guidelines that have active rule implementations, in display order. */
const ALL_GUIDELINE_IDS: GuidelineId[] = [
  "gendai-kanazukai-1986",
  "jtf-style-3",
  "editors-rulebook",
];

interface GuidelineListProps {
  /** List of enabled guideline IDs. */
  guidelines: GuidelineId[];
  /** Called with the updated list when the user toggles a guideline. */
  onChange: (guidelines: GuidelineId[]) => void;
}

/** Build a Google Shopping URL for a given guideline. */
function buildShoppingUrl(meta: Guideline): string {
  const parts = [meta.nameJa, meta.publisherJa];
  if (meta.year !== null) parts.push(String(meta.year));
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(parts.join(" "))}`;
}

/**
 * Display label for a guideline license.
 * Paid guidelines show a "購入へ" link instead of a badge.
 */
function LicenseBadge({ license, meta }: { license: GuidelineLicense; meta: Guideline }) {
  if (license === "Paid") {
    return (
      <a
        href={buildShoppingUrl(meta)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-[10px] text-foreground-secondary hover:text-accent flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        購入へ
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    );
  }

  const styles: Record<Exclude<GuidelineLicense, "Paid">, string> = {
    Public: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    "CC BY 4.0": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };
  const labels: Record<Exclude<GuidelineLicense, "Paid">, string> = {
    Public: "公開",
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
 * GuidelineList — shows implemented guidelines as a simple enable/disable list.
 *
 * Guidelines present in `guidelines` prop are considered enabled.
 * Guidelines absent from the array are shown as disabled.
 */
export default function GuidelineList({ guidelines, onChange }: GuidelineListProps) {
  const enabledSet = useMemo(() => new Set(guidelines), [guidelines]);

  const handleToggle = useCallback(
    (id: GuidelineId) => {
      if (enabledSet.has(id)) {
        onChange(guidelines.filter((g) => g !== id));
      } else {
        onChange([...guidelines, id]);
      }
    },
    [enabledSet, guidelines, onChange],
  );

  return (
    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
      {ALL_GUIDELINE_IDS.map((id, displayIdx) => {
        const meta = GUIDELINES[id];
        const isEnabled = enabledSet.has(id);

        return (
          <div
            key={id}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 transition-colors",
              isEnabled ? "bg-background" : "bg-background-tertiary/40 opacity-60",
              displayIdx === 0 && "rounded-t-lg",
            )}
          >
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

            {/* License badge / purchase link */}
            <LicenseBadge license={meta.license} meta={meta} />

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
                  "inline-block h-3.5 w-3.5 transform rounded-full transition-transform shadow-sm",
                  isEnabled ? "translate-x-5 bg-accent-foreground" : "translate-x-0.5 bg-white",
                )}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
