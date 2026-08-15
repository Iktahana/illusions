"use client";

import type React from "react";
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import clsx from "clsx";
import { Button, TextInput } from "@/shared/ui/primitives";

import { matchesQuery } from "./fuzzy-match";

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
  /** Placeholder text for the search input. */
  searchPlaceholder?: string;
}

/**
 * Grouped left navigation for the settings modal. Replaces the 150 lines
 * of hand-written <button>s in SettingsModal.tsx with a data-driven
 * grouped list. A fuzzy search box at the top filters items across all
 * groups; during an active search, group headings and separators are
 * suppressed so matches read as a flat list.
 */
export default function SettingsNav<C extends string>({
  groups,
  active,
  onSelect,
  "aria-label": ariaLabel,
  searchPlaceholder = "検索",
}: SettingsNavProps<C>): React.ReactElement {
  const [query, setQuery] = useState("");
  const isSearching = query.trim().length > 0;

  const filteredGroups = useMemo(() => {
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.hidden && matchesQuery(item.label, query)),
    }));
  }, [groups, query]);

  return (
    <nav
      aria-label={ariaLabel}
      className="flex min-w-[10rem] max-w-[12rem] flex-shrink-0 flex-col overflow-hidden border-r border-border bg-background-secondary"
    >
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-tertiary"
            aria-hidden
          />
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="設定を検索"
            className="border-border pl-7 pr-2"
          />
        </div>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {(() => {
          const rendered: React.ReactNode[] = [];
          let hasRenderedGroup = false;
          filteredGroups.forEach((group, groupIdx) => {
            if (group.items.length === 0) return;
            if (group.separator && hasRenderedGroup && !isSearching) {
              rendered.push(
                <li key={`sep-${groupIdx}`} aria-hidden>
                  <hr className="my-2 border-border" />
                </li>,
              );
            }
            rendered.push(
              <li key={group.label ?? `group-${groupIdx}`} className="space-y-1">
                {group.label && !isSearching && (
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-tertiary">
                    {group.label}
                  </div>
                )}
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.id === active;
                    return (
                      <li key={item.id}>
                        <Button
                          onClick={() => onSelect(item.id)}
                          aria-current={isActive ? "page" : undefined}
                          variant={isActive ? "primary" : "ghost"}
                          fullWidth
                          className={clsx(
                            "justify-start gap-1.5 px-3 text-left",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground-secondary hover:bg-hover hover:text-foreground",
                          )}
                        >
                          {Icon && <Icon className="h-4 w-4" aria-hidden />}
                          <span>{item.label}</span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </li>,
            );
            hasRenderedGroup = true;
          });
          if (rendered.length === 0 && isSearching) {
            rendered.push(
              <li
                key="no-results"
                className="px-3 py-4 text-center text-xs text-foreground-tertiary"
              >
                一致する項目がありません
              </li>,
            );
          }
          return rendered;
        })()}
      </ul>
    </nav>
  );
}
