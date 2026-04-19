"use client";

import type React from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export interface SettingsNavItem<C extends string> {
  id: C;
  label: string;
  icon?: LucideIcon;
  /** Hidden items are skipped entirely (used for Electron-only tabs on Web). */
  hidden?: boolean;
}

export interface SettingsNavGroup<C extends string> {
  /** Optional section heading rendered above the group's items. */
  label?: string;
  items: Array<SettingsNavItem<C>>;
  /** When true, render a horizontal divider just above this group. */
  separator?: boolean;
}

export interface SettingsNavProps<C extends string> {
  groups: ReadonlyArray<SettingsNavGroup<C>>;
  active: C;
  onSelect: (id: C) => void;
  /** Accessible landmark label (e.g., "設定カテゴリ"). */
  "aria-label"?: string;
}

/**
 * Grouped left navigation for the settings modal. Replaces the 150 lines
 * of hand-written <button>s in SettingsModal.tsx with a data-driven
 * grouped list.
 */
export default function SettingsNav<C extends string>({
  groups,
  active,
  onSelect,
  "aria-label": ariaLabel,
}: SettingsNavProps<C>): React.ReactElement {
  return (
    <nav
      aria-label={ariaLabel}
      className="min-w-[10rem] max-w-[12rem] flex-shrink-0 overflow-y-auto border-r border-border bg-background-secondary p-2"
    >
      <ul className="space-y-1">
        {(() => {
          const rendered: React.ReactNode[] = [];
          let hasRenderedGroup = false;
          groups.forEach((group, groupIdx) => {
            const visibleItems = group.items.filter((item) => !item.hidden);
            if (visibleItems.length === 0) return;
            if (group.separator && hasRenderedGroup) {
              rendered.push(
                <li key={`sep-${groupIdx}`} aria-hidden>
                  <hr className="my-2 border-border" />
                </li>,
              );
            }
            rendered.push(
              <li key={group.label ?? `group-${groupIdx}`} className="space-y-1">
                {group.label && (
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-tertiary">
                    {group.label}
                  </div>
                )}
                <ul className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.id === active;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(item.id)}
                          aria-current={isActive ? "page" : undefined}
                          className={clsx(
                            "flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                          )}
                        >
                          {Icon && <Icon className="h-4 w-4" aria-hidden />}
                          <span>{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>,
            );
            hasRenderedGroup = true;
          });
          return rendered;
        })()}
      </ul>
    </nav>
  );
}
