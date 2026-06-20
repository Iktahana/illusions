"use client";

import type React from "react";
import clsx from "clsx";

export type SourceType = "built-in" | "official" | "third-party";

interface SourceBadgeProps {
  source: SourceType;
}

const SOURCE_LABELS: Record<SourceType, string> = {
  "built-in": "内蔵",
  official: "公式",
  "third-party": "サードパーティ",
};

const SOURCE_COLORS: Record<SourceType, string> = {
  "built-in": "bg-foreground-muted/20 text-foreground-secondary border-border-secondary",
  official: "bg-accent/10 text-accent border-accent/30",
  "third-party": "bg-warning/10 text-warning border-warning/30",
};

export default function SourceBadge({ source }: SourceBadgeProps): React.ReactElement {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border leading-none",
        SOURCE_COLORS[source],
      )}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}
