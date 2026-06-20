"use client";

import type React from "react";
import { ExternalLink } from "lucide-react";
import clsx from "clsx";

export interface LicenseBadgeProps {
  /** Free-form license name from the ruleset manifest (e.g. "CC BY 4.0", "MIT", "書籍"). */
  license?: string;
  /** Optional link to the license text / deed. Wraps the badge in an anchor. */
  licenseUrl?: string;
  /**
   * Optional purchase / where-to-obtain link. For commercial physical books
   * the orthographic conventions are free to reuse but the book itself must be
   * bought — surface a 「購入へ」link instead of a license badge.
   */
  purchaseUrl?: string;
}

/** Heuristic badge color for well-known open licenses; neutral otherwise. */
function badgeClass(license: string): string {
  const l = license.toLowerCase();
  if (l.includes("public") || l.includes("告示") || l.includes("公開")) {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
  if (l.includes("cc") || l.includes("mit") || l.includes("apache") || l.includes("bsd")) {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  }
  return "bg-background-tertiary text-foreground-tertiary border border-border-secondary";
}

/**
 * Renders, to the right of a ruleset name, either:
 *  - a 「購入へ」external link (when `purchaseUrl` is set — physical books), or
 *  - a license badge (optionally linking to the license text).
 *
 * Returns null when there is nothing to show.
 */
export default function LicenseBadge({
  license,
  licenseUrl,
  purchaseUrl,
}: LicenseBadgeProps): React.ReactElement | null {
  if (purchaseUrl) {
    return (
      <a
        href={purchaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-[10px] text-foreground-secondary hover:text-accent flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
        title="この書籍の購入ページを開く"
      >
        購入へ
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    );
  }

  if (!license) return null;

  const badge = (
    <span
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none flex-shrink-0",
        badgeClass(license),
      )}
    >
      {license}
    </span>
  );

  if (licenseUrl) {
    return (
      <a
        href={licenseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex flex-shrink-0 hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
        title="ライセンス全文を開く"
      >
        {badge}
      </a>
    );
  }

  return badge;
}
