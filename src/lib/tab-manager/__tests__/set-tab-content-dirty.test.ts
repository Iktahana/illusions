/**
 * Regression test for #1876: non-active (background/popout) tab content sync
 * must recompute isDirty rather than performing a shallow updateTab merge.
 *
 * The production fix lives in useTabState.setTabContent().
 * We extract the pure updater logic and test it without React.
 */

import { describe, it, expect } from "vitest";

import type { TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab } from "@/lib/tab-manager/tab-types";
import { createNewTab } from "@/lib/tab-manager/types";

// ---------------------------------------------------------------------------
// Pure updater — mirrors setTabContent's setTabs functional updater
// ---------------------------------------------------------------------------

/**
 * Mirrors the setTabs updater inside useTabState.setTabContent().
 * Tests the core logic in isolation from the React hook lifecycle.
 */
function applySetTabContent(tabs: TabState[], tabId: string, newContent: string): TabState[] {
  return tabs.map((tab): TabState => {
    if (tab.id !== tabId || !isEditorTab(tab)) return tab;
    const dirty = newContent !== tab.lastSavedContent;
    return {
      ...tab,
      content: newContent,
      isDirty: dirty,
      isPreview: dirty ? false : tab.isPreview,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("setTabContent — background/popout dirty recomputation (#1876)", () => {
  it("marks a non-active tab dirty when content differs from lastSavedContent", () => {
    const saved = "saved content";
    const tab = createNewTab(saved);
    // Simulate a save: lastSavedContent matches content, isDirty=false
    expect(tab.isDirty).toBe(false);

    // Popout window edits the content
    const edited = "edited in popout";
    const [updated] = applySetTabContent([tab], tab.id, edited).filter(isEditorTab);

    expect(updated.content).toBe(edited);
    expect(updated.isDirty).toBe(true);
  });

  it("keeps isDirty=false when content matches lastSavedContent (no real change)", () => {
    const saved = "identical content";
    const tab = createNewTab(saved);

    const [updated] = applySetTabContent([tab], tab.id, saved).filter(isEditorTab);

    expect(updated.content).toBe(saved);
    expect(updated.isDirty).toBe(false);
  });

  it("promotes a preview tab to fixed when content changes", () => {
    const tab = createNewTab("original");
    // Force isPreview=true to simulate a preview tab
    const previewTab = { ...tab, isPreview: true };

    const [updated] = applySetTabContent([previewTab], previewTab.id, "changed").filter(
      isEditorTab,
    );

    expect(updated.isDirty).toBe(true);
    expect(updated.isPreview).toBe(false);
  });

  it("leaves a preview tab as preview when content is unchanged", () => {
    const saved = "unchanged";
    const tab = createNewTab(saved);
    const previewTab = { ...tab, isPreview: true };

    const [updated] = applySetTabContent([previewTab], previewTab.id, saved).filter(isEditorTab);

    expect(updated.isDirty).toBe(false);
    expect(updated.isPreview).toBe(true);
  });

  it("does not affect other tabs in the array", () => {
    const tabA = createNewTab("content A");
    const tabB = createNewTab("content B");

    const result = applySetTabContent([tabA, tabB], tabA.id, "new content for A");
    const [, bResult] = result.filter(isEditorTab);

    // tabB must be untouched (same reference)
    expect(bResult).toBe(tabB);
  });

  it("old updateTab shallow merge would NOT set isDirty (regression guard)", () => {
    // Demonstrate the pre-fix broken behaviour: updateTab was called with
    // { content: newContent } which does NOT recompute isDirty.
    const saved = "saved content";
    const tab = createNewTab(saved);

    // Broken pre-fix path: shallow merge only sets content
    const broken: TabState[] = [tab].map((t) => {
      if (t.id !== tab.id || !isEditorTab(t)) return t;
      return { ...t, content: "popout edit" }; // no isDirty update!
    });
    const [brokenTab] = broken.filter(isEditorTab);

    // isDirty would remain false — the bug
    expect(brokenTab.isDirty).toBe(false);
    expect(brokenTab.content).toBe("popout edit");

    // Fixed path correctly marks dirty
    const [fixedTab] = applySetTabContent([tab], tab.id, "popout edit").filter(isEditorTab);
    expect(fixedTab.isDirty).toBe(true);
    expect(fixedTab.content).toBe("popout edit");
  });
});
