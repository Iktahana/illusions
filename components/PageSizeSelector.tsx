"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronRight, Check } from "lucide-react";
import clsx from "clsx";
import { PAGE_SIZE_CATEGORIES, formatDimensions } from "@/lib/export/page-sizes";
import type { PageSizeEntry } from "@/lib/export/page-sizes";

interface PageSizeSelectorProps {
  value: string;
  onChange: (key: string) => void;
}

/** Resolve a page size key to its display label */
function findEntry(key: string): PageSizeEntry | undefined {
  for (const cat of PAGE_SIZE_CATEGORIES) {
    const found = cat.sizes.find((s) => s.key === key);
    if (found) return found;
  }
  return undefined;
}

/** Searchable dropdown for page sizes, grouped by category */
export function PageSizeSelector({ value, onChange }: PageSizeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedEntry = useMemo(() => findEntry(value), [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (key: string) => {
    onChange(key);
    setIsOpen(false);
    setSearchTerm("");
  };

  // Filter categories and sizes by search term
  const filteredCategories = useMemo(() => {
    if (!searchTerm) return PAGE_SIZE_CATEGORIES;

    const term = searchTerm.toLowerCase();
    const seen = new Set<string>();
    const results: { name: string; sizes: PageSizeEntry[] }[] = [];

    for (const cat of PAGE_SIZE_CATEGORIES) {
      const matched = cat.sizes.filter((s) => {
        if (seen.has(s.key)) return false;
        const match =
          s.key.toLowerCase().includes(term) ||
          s.label.toLowerCase().includes(term) ||
          s.label.includes(searchTerm); // Japanese match
        if (match) seen.add(s.key);
        return match;
      });
      if (matched.length > 0) {
        results.push({ name: cat.name, sizes: matched });
      }
    }
    return results;
  }, [searchTerm]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected size display */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-sm border border-border-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground text-left flex items-center justify-between"
      >
        <span>
          {selectedEntry?.label || value}
          <span className="ml-2 text-foreground-secondary text-xs">{formatDimensions(value)}</span>
        </span>
        <ChevronRight
          className={clsx("w-4 h-4 transition-transform", isOpen ? "rotate-90" : "rotate-0")}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border-secondary rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>

          {/* Size list */}
          <div className="overflow-y-auto flex-1">
            {filteredCategories.map((cat) => (
              <div key={cat.name}>
                {/* Category header */}
                <div className="sticky top-0 px-3 py-1.5 text-xs font-semibold text-foreground-secondary bg-background-secondary">
                  {cat.name}
                </div>
                {cat.sizes.map((entry) => (
                  <button
                    key={`${cat.name}-${entry.key}`}
                    type="button"
                    onClick={() => handleSelect(entry.key)}
                    className={clsx(
                      "w-full px-3 py-1.5 text-sm text-left flex items-center justify-between hover:bg-background-hover",
                      entry.key === value && "bg-background-hover",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {entry.key === value ? (
                        <Check className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <span className="w-3.5" />
                      )}
                      {entry.label}
                    </span>
                    <span className="text-xs text-foreground-secondary">
                      {entry.width}×{entry.height}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {filteredCategories.length === 0 && (
              <div className="px-3 py-4 text-sm text-foreground-secondary text-center">
                該当なし
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
