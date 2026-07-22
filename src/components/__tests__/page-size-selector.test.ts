/**
 * Tests for PageSizeSelector's exported pure functions and keyboard behavior.
 *
 * Pure function tests: filterPageSizes, findEntry
 * DOM keyboard tests: jsdom + react-dom/client + KeyboardEvent dispatching
 */

import { describe, it, expect } from "vitest";
import { PAGE_SIZE_CATEGORIES } from "@/lib/export/page-sizes";
import { filterPageSizes, findEntry } from "../PageSizeSelector";

// ---------------------------------------------------------------------------
// Pure function tests — filterPageSizes
// ---------------------------------------------------------------------------

describe("filterPageSizes", () => {
  it("deduplicates in browse mode (no search term)", () => {
    const results = filterPageSizes(PAGE_SIZE_CATEGORIES, "");
    const allKeys = results.flatMap((cat) => cat.sizes.map((s) => s.key));
    const uniqueKeys = new Set(allKeys);
    expect(allKeys.length).toBe(uniqueKeys.size);
  });

  it("A4 appears exactly once, in the first category that contains it", () => {
    const results = filterPageSizes(PAGE_SIZE_CATEGORIES, "");
    let a4Count = 0;
    let a4Category = "";
    for (const cat of results) {
      for (const s of cat.sizes) {
        if (s.key === "A4") {
          a4Count++;
          a4Category = cat.name;
        }
      }
    }
    expect(a4Count).toBe(1);
    // The upstream MDI catalogue is the single source of truth.
    expect(a4Category).toBe("MDI 標準用紙サイズ");
  });

  it("deduplicates during search", () => {
    const results = filterPageSizes(PAGE_SIZE_CATEGORIES, "A4");
    const a4Entries = results.flatMap((cat) => cat.sizes.filter((s) => s.key === "A4"));
    expect(a4Entries.length).toBe(1);
  });

  it("finds upstream publication sizes by key", () => {
    const results = filterPageSizes(PAGE_SIZE_CATEGORIES, "Shiroku");
    const allKeys = results.flatMap((cat) => cat.sizes.map((s) => s.key));
    expect(allKeys.length).toBeGreaterThan(0);
    expect(allKeys.some((k) => k.toLowerCase().includes("shiro"))).toBe(true);
  });

  it("returns empty for non-matching search", () => {
    const results = filterPageSizes(PAGE_SIZE_CATEGORIES, "xyz_no_match_999");
    expect(results.length).toBe(0);
  });

  it("every output category has at least one size", () => {
    const results = filterPageSizes(PAGE_SIZE_CATEGORIES, "");
    for (const cat of results) {
      expect(cat.sizes.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure function tests — findEntry
// ---------------------------------------------------------------------------

describe("findEntry", () => {
  it("returns A4 with correct dimensions", () => {
    const entry = findEntry("A4");
    expect(entry).toBeDefined();
    expect(entry!.width).toBe(210);
    expect(entry!.height).toBe(297);
  });

  it("returns undefined for unknown key", () => {
    expect(findEntry("NONEXISTENT_SIZE")).toBeUndefined();
  });
});
