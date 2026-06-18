import { beforeEach, describe, expect, it } from "vitest";

import { addSearchHistoryEntry, loadSearchHistory } from "@/lib/editor-page/search-history";

describe("search history", () => {
  beforeEach(() => localStorage.clear());

  it("stores unique non-empty terms with the newest first", () => {
    addSearchHistoryEntry(" first ");
    addSearchHistoryEntry("second");
    addSearchHistoryEntry("first");
    addSearchHistoryEntry("   ");

    expect(loadSearchHistory()).toEqual(["first", "second"]);
  });

  it("keeps only the ten most recent terms", () => {
    for (let index = 0; index < 12; index += 1) addSearchHistoryEntry(`term-${index}`);

    expect(loadSearchHistory()).toHaveLength(10);
    expect(loadSearchHistory()[0]).toBe("term-11");
    expect(loadSearchHistory().at(-1)).toBe("term-2");
  });

  it("recovers from malformed persisted data", () => {
    localStorage.setItem("illusions:search-history", "not-json");
    expect(loadSearchHistory()).toEqual([]);
  });
});
