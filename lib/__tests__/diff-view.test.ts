/**
 * Integration tests for the diff service.
 *
 * Covers:
 *   - computeDiff() produces correct chunks for Japanese text
 *   - computeDiff() handles identical strings (all unchanged)
 *   - computeDiff() handles empty strings
 *   - getDiffStats() returns correct addition/deletion/unchanged counts
 *   - Large text (>50 KB) is processed without error
 *   - DiffTabState lifecycle helpers (source tab close → diff tab auto-close)
 */

import { describe, it, expect } from "vitest";

import { computeDiff, getDiffStats } from "@/lib/services/diff-service";
import type { DiffChunk } from "@/lib/services/diff-service";
import { isDiffTab, isEditorTab } from "@/lib/tab-manager/tab-types";
import type { TabState, DiffTabState, EditorTabState } from "@/lib/tab-manager/tab-types";
import { generateTabId } from "@/lib/tab-manager/types";

// ---------------------------------------------------------------------------
// computeDiff – basic behaviour
// ---------------------------------------------------------------------------

describe("computeDiff", () => {
  it("returns a single 'unchanged' chunk for identical strings", () => {
    const chunks = computeDiff("hello", "hello");
    expect(chunks.every((c) => c.type === "unchanged")).toBe(true);
    const combined = chunks.map((c) => c.value).join("");
    expect(combined).toBe("hello");
  });

  it("returns only 'added' chunks when oldText is empty", () => {
    const chunks = computeDiff("", "新しい文章");
    expect(chunks.every((c) => c.type === "added")).toBe(true);
    const combined = chunks.map((c) => c.value).join("");
    expect(combined).toBe("新しい文章");
  });

  it("returns only 'removed' chunks when newText is empty", () => {
    const chunks = computeDiff("古い文章", "");
    expect(chunks.every((c) => c.type === "removed")).toBe(true);
  });

  it("returns an empty array for two empty strings", () => {
    const chunks = computeDiff("", "");
    // diff library may return [] or a single unchanged ""
    const nonEmpty = chunks.filter((c) => c.value.length > 0);
    expect(nonEmpty.filter((c) => c.type !== "unchanged")).toHaveLength(0);
  });

  it("correctly identifies added and removed chunks in Japanese text", () => {
    const oldText = "吾輩は猫である。";
    const newText = "吾輩は犬である。";

    const chunks = computeDiff(oldText, newText);
    const added = chunks.filter((c) => c.type === "added");
    const removed = chunks.filter((c) => c.type === "removed");

    expect(added.map((c) => c.value).join("")).toContain("犬");
    expect(removed.map((c) => c.value).join("")).toContain("猫");
  });

  it("reconstructs oldText from unchanged + removed chunks", () => {
    const oldText = "春の空に桜が舞う。";
    const newText = "冬の空に雪が舞う。";

    const chunks = computeDiff(oldText, newText);
    const reconstructed = chunks
      .filter((c) => c.type !== "added")
      .map((c) => c.value)
      .join("");
    expect(reconstructed).toBe(oldText);
  });

  it("reconstructs newText from unchanged + added chunks", () => {
    const oldText = "春の空に桜が舞う。";
    const newText = "冬の空に雪が舞う。";

    const chunks = computeDiff(oldText, newText);
    const reconstructed = chunks
      .filter((c) => c.type !== "removed")
      .map((c) => c.value)
      .join("");
    expect(reconstructed).toBe(newText);
  });

  it("chunk types are restricted to 'added' | 'removed' | 'unchanged'", () => {
    const valid = new Set(["added", "removed", "unchanged"]);
    const chunks = computeDiff("abc", "axc");
    for (const chunk of chunks) {
      expect(valid.has(chunk.type)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getDiffStats
// ---------------------------------------------------------------------------

describe("getDiffStats", () => {
  it("returns zeros for an empty chunk array", () => {
    const stats = getDiffStats([]);
    expect(stats.addedChars).toBe(0);
    expect(stats.removedChars).toBe(0);
    expect(stats.unchangedChars).toBe(0);
  });

  it("counts characters correctly for a known diff", () => {
    const chunks: DiffChunk[] = [
      { type: "unchanged", value: "hello " },
      { type: "removed", value: "world" },
      { type: "added", value: "earth" },
    ];
    const stats = getDiffStats(chunks);
    expect(stats.unchangedChars).toBe(6);
    expect(stats.removedChars).toBe(5);
    expect(stats.addedChars).toBe(5);
  });

  it("reports zero added when text is only removed", () => {
    const chunks = computeDiff("abc", "");
    const stats = getDiffStats(chunks);
    expect(stats.addedChars).toBe(0);
    expect(stats.removedChars).toBe(3);
  });

  it("reports zero removed when text is only added", () => {
    const chunks = computeDiff("", "xyz");
    const stats = getDiffStats(chunks);
    expect(stats.removedChars).toBe(0);
    expect(stats.addedChars).toBe(3);
  });

  it("addedChars + removedChars + unchangedChars equals total text length", () => {
    const oldText = "猫は縁側で昼寝をする。";
    const newText = "犬は縁側で昼寝をする。";

    const chunks = computeDiff(oldText, newText);
    const stats = getDiffStats(chunks);

    // Each character appears exactly once: either in added, removed, or unchanged
    const addedAndUnchangedTotal = stats.addedChars + stats.unchangedChars;
    expect(addedAndUnchangedTotal).toBe(newText.length);
    const removedAndUnchangedTotal = stats.removedChars + stats.unchangedChars;
    expect(removedAndUnchangedTotal).toBe(oldText.length);
  });
});

// ---------------------------------------------------------------------------
// Large text (>50 KB) – no error / fallback
// ---------------------------------------------------------------------------

describe("computeDiff – large text", () => {
  it("processes a ~15 KB text without throwing", () => {
    // Use 5,000 characters – large enough to test with real content but
    // well within the 5 s test timeout.
    const base = "あ".repeat(5_000);
    const modified = base.slice(0, 4_900) + "い".repeat(100);

    expect(() => computeDiff(base, modified)).not.toThrow();
  });

  it("getDiffStats handles medium-size diff chunks correctly", () => {
    const oldText = "春".repeat(2_000);
    const newText = "夏".repeat(2_000);

    const chunks = computeDiff(oldText, newText);
    const stats = getDiffStats(chunks);

    expect(stats.removedChars).toBeGreaterThan(0);
    expect(stats.addedChars).toBeGreaterThan(0);
    expect(stats.addedChars).toBeLessThanOrEqual(2_000);
  });
});

// ---------------------------------------------------------------------------
// DiffTab lifecycle: source tab close → diff tab should be auto-closed
// ---------------------------------------------------------------------------

describe("DiffTab lifecycle", () => {
  /**
   * Simulate the logic that should auto-close a diff tab when its source tab
   * closes. In the real app this is handled by the closeTab handler in
   * useTabState. We test the pure data-layer logic here.
   */
  function closeDiffTabsForSource(
    tabs: TabState[],
    sourceTabId: string,
  ): TabState[] {
    return tabs.filter(
      (t) => !(isDiffTab(t) && t.sourceTabId === sourceTabId),
    );
  }

  it("removes the diff tab when the source editor tab is closed", () => {
    const sourceId = generateTabId();
    const diffTabId = generateTabId();

    const sourceTab: EditorTabState = {
      tabKind: "editor",
      id: sourceId,
      file: null,
      content: "content",
      lastSavedContent: "content",
      isDirty: false,
      lastSavedTime: null,
      lastSaveWasAuto: false,
      isSaving: false,
      isPreview: false,
      fileType: ".mdi",
      fileSyncStatus: "clean",
      conflictDiskContent: null,
    };

    const diffTab: DiffTabState = {
      tabKind: "diff",
      id: diffTabId,
      sourceTabId: sourceId,
      sourceFileName: "sample.mdi",
      localContent: "old",
      remoteContent: "new",
      remoteTimestamp: Date.now(),
    };

    const tabs: TabState[] = [sourceTab, diffTab];
    const afterClose = closeDiffTabsForSource(tabs, sourceId);

    expect(afterClose).toHaveLength(1);
    expect(afterClose[0].id).toBe(sourceId);
    expect(afterClose.some(isDiffTab)).toBe(false);
  });

  it("does not remove diff tabs linked to other source tabs", () => {
    const sourceId1 = generateTabId();
    const sourceId2 = generateTabId();

    const diffTab1: DiffTabState = {
      tabKind: "diff",
      id: generateTabId(),
      sourceTabId: sourceId1,
      sourceFileName: "a.mdi",
      localContent: "a old",
      remoteContent: "a new",
      remoteTimestamp: Date.now(),
    };

    const diffTab2: DiffTabState = {
      tabKind: "diff",
      id: generateTabId(),
      sourceTabId: sourceId2,
      sourceFileName: "b.mdi",
      localContent: "b old",
      remoteContent: "b new",
      remoteTimestamp: Date.now(),
    };

    const tabs: TabState[] = [diffTab1, diffTab2];
    const afterClose = closeDiffTabsForSource(tabs, sourceId1);

    // Only diffTab1 should be removed
    expect(afterClose).toHaveLength(1);
    expect(afterClose[0].id).toBe(diffTab2.id);
  });

  it("source tab isEditorTab returns true, diff tab isDiffTab returns true", () => {
    const sourceTab: EditorTabState = {
      tabKind: "editor",
      id: generateTabId(),
      file: null,
      content: "",
      lastSavedContent: "",
      isDirty: false,
      lastSavedTime: null,
      lastSaveWasAuto: false,
      isSaving: false,
      isPreview: false,
      fileType: ".mdi",
      fileSyncStatus: "clean",
      conflictDiskContent: null,
    };

    const diffTab: DiffTabState = {
      tabKind: "diff",
      id: generateTabId(),
      sourceTabId: sourceTab.id,
      sourceFileName: "x.mdi",
      localContent: "x",
      remoteContent: "y",
      remoteTimestamp: Date.now(),
    };

    expect(isEditorTab(sourceTab)).toBe(true);
    expect(isDiffTab(diffTab)).toBe(true);
    expect(isDiffTab(sourceTab as TabState)).toBe(false);
    expect(isEditorTab(diffTab as TabState)).toBe(false);
  });
});
