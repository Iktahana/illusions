"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ChevronRight, Check } from "lucide-react";
import clsx from "clsx";
import { PAGE_SIZE_CATEGORIES, formatDimensions } from "@/lib/export/page-sizes";
import type { PageSizeEntry, PageSizeCategory } from "@/lib/export/page-sizes";

interface PageSizeSelectorProps {
  value: string;
  onChange: (key: string) => void;
}

/** Resolve a page size key to its display label */
export function findEntry(key: string): PageSizeEntry | undefined {
  for (const cat of PAGE_SIZE_CATEGORIES) {
    const found = cat.sizes.find((s) => s.key === key);
    if (found) return found;
  }
  return undefined;
}

/**
 * Filter and deduplicate page sizes by search term.
 * Deduplication always runs — a key that appears in an earlier category
 * is removed from later categories (e.g. A4 in "おすすめ" shadows A4 in "ISO A").
 */
export function filterPageSizes(
  categories: PageSizeCategory[],
  searchTerm: string,
): { name: string; sizes: PageSizeEntry[] }[] {
  const term = searchTerm.toLowerCase();
  const seen = new Set<string>();
  const results: { name: string; sizes: PageSizeEntry[] }[] = [];

  for (const cat of categories) {
    const matched = cat.sizes.filter((s) => {
      if (seen.has(s.key)) return false;
      if (searchTerm) {
        const match =
          s.key.toLowerCase().includes(term) ||
          s.label.toLowerCase().includes(term) ||
          s.label.includes(searchTerm); // Japanese match
        if (!match) return false;
      }
      seen.add(s.key);
      return true;
    });
    if (matched.length > 0) {
      results.push({ name: cat.name, sizes: matched });
    }
  }
  return results;
}

/** Searchable dropdown for page sizes, grouped by category */
export function PageSizeSelector({ value, onChange }: PageSizeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedEntry = useMemo(() => findEntry(value), [value]);

  const filteredCategories = useMemo(
    () => filterPageSizes(PAGE_SIZE_CATEGORIES, searchTerm),
    [searchTerm],
  );

  // Flat list of all visible items for keyboard navigation
  const flatItems = useMemo(() => {
    const items: PageSizeEntry[] = [];
    for (const cat of filteredCategories) {
      for (const s of cat.sizes) {
        items.push(s);
      }
    }
    return items;
  }, [filteredCategories]);

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredCategories]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-flat-index="${highlightedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

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

  const handleSelect = useCallback(
    (key: string) => {
      onChange(key);
      setIsOpen(false);
      setSearchTerm("");
      setHighlightedIndex(-1);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setSearchTerm("");
          setHighlightedIndex(-1);
          triggerRef.current?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < flatItems.length) {
            handleSelect(flatItems[highlightedIndex].key);
          }
          break;
      }
    },
    [flatItems, highlightedIndex, handleSelect],
  );

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }, []);

  // Build a flat index counter for data-flat-index attributes
  let flatIndex = 0;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected size display */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
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
              onKeyDown={handleSearchKeyDown}
              className="w-full px-2 py-1 text-sm border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>

          {/* Size list */}
          <div className="overflow-y-auto flex-1" ref={listRef}>
            {filteredCategories.map((cat) => (
              <div key={cat.name}>
                {/* Category header */}
                <div className="sticky top-0 px-3 py-1.5 text-xs font-semibold text-foreground-secondary bg-background-secondary">
                  {cat.name}
                </div>
                {cat.sizes.map((entry) => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={`${cat.name}-${entry.key}`}
                      type="button"
                      data-flat-index={idx}
                      onClick={() => handleSelect(entry.key)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={clsx(
                        "w-full px-3 py-1.5 text-sm text-left flex items-center justify-between hover:bg-background-hover",
                        entry.key === value && "bg-background-hover",
                        idx === highlightedIndex && "bg-background-hover",
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
                  );
                })}
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
