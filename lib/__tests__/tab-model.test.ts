/**
 * Integration tests for the discriminated union tab model.
 *
 * Covers:
 *   - Type guards: isEditorTab, isTerminalTab, isDiffTab
 *   - Tab factory functions and correct shape of each variant
 *   - Tab union-level type narrowing behavior
 */

import { describe, it, expect } from "vitest";

import {
  isEditorTab,
  isTerminalTab,
  isDiffTab,
} from "@/lib/tab-manager/tab-types";
import type {
  TabState,
  EditorTabState,
  TerminalTabState,
  DiffTabState,
} from "@/lib/tab-manager/tab-types";
import { createNewTab, generateTabId } from "@/lib/tab-manager/types";

// ---------------------------------------------------------------------------
// Helpers – minimal valid tab fixtures
// ---------------------------------------------------------------------------

function makeEditorTab(overrides?: Partial<EditorTabState>): EditorTabState {
  return {
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
    ...overrides,
  };
}

function makeTerminalTab(overrides?: Partial<TerminalTabState>): TerminalTabState {
  return {
    tabKind: "terminal",
    id: generateTabId(),
    sessionId: "session-001",
    label: "Terminal",
    cwd: "/home/user",
    shell: "/bin/zsh",
    status: "running",
    exitCode: null,
    createdAt: Date.now(),
    source: "user",
    ...overrides,
  };
}

function makeDiffTab(overrides?: Partial<DiffTabState>): DiffTabState {
  const sourceTabId = generateTabId();
  return {
    tabKind: "diff",
    id: generateTabId(),
    sourceTabId,
    sourceFileName: "sample.mdi",
    localContent: "original text",
    remoteContent: "modified text",
    remoteTimestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isEditorTab
// ---------------------------------------------------------------------------

describe("isEditorTab", () => {
  it("returns true for an editor tab", () => {
    const tab: TabState = makeEditorTab();
    expect(isEditorTab(tab)).toBe(true);
  });

  it("returns false for a terminal tab", () => {
    const tab: TabState = makeTerminalTab();
    expect(isEditorTab(tab)).toBe(false);
  });

  it("returns false for a diff tab", () => {
    const tab: TabState = makeDiffTab();
    expect(isEditorTab(tab)).toBe(false);
  });

  it("narrows the type so editor-only fields are accessible", () => {
    const tab: TabState = makeEditorTab({ content: "hello" });
    if (isEditorTab(tab)) {
      // TypeScript would error here if narrowing did not work
      expect(tab.content).toBe("hello");
      expect(tab.fileSyncStatus).toBe("clean");
    } else {
      throw new Error("Expected isEditorTab to return true");
    }
  });
});

// ---------------------------------------------------------------------------
// isTerminalTab
// ---------------------------------------------------------------------------

describe("isTerminalTab", () => {
  it("returns true for a terminal tab", () => {
    const tab: TabState = makeTerminalTab();
    expect(isTerminalTab(tab)).toBe(true);
  });

  it("returns false for an editor tab", () => {
    const tab: TabState = makeEditorTab();
    expect(isTerminalTab(tab)).toBe(false);
  });

  it("returns false for a diff tab", () => {
    const tab: TabState = makeDiffTab();
    expect(isTerminalTab(tab)).toBe(false);
  });

  it("narrows the type so terminal-only fields are accessible", () => {
    const tab: TabState = makeTerminalTab({ sessionId: "sess-xyz" });
    if (isTerminalTab(tab)) {
      expect(tab.sessionId).toBe("sess-xyz");
      expect(tab.status).toBe("running");
    } else {
      throw new Error("Expected isTerminalTab to return true");
    }
  });
});

// ---------------------------------------------------------------------------
// isDiffTab
// ---------------------------------------------------------------------------

describe("isDiffTab", () => {
  it("returns true for a diff tab", () => {
    const tab: TabState = makeDiffTab();
    expect(isDiffTab(tab)).toBe(true);
  });

  it("returns false for an editor tab", () => {
    const tab: TabState = makeEditorTab();
    expect(isDiffTab(tab)).toBe(false);
  });

  it("returns false for a terminal tab", () => {
    const tab: TabState = makeTerminalTab();
    expect(isDiffTab(tab)).toBe(false);
  });

  it("narrows the type so diff-only fields are accessible", () => {
    const tab: TabState = makeDiffTab({ sourceFileName: "chapter1.mdi" });
    if (isDiffTab(tab)) {
      expect(tab.sourceFileName).toBe("chapter1.mdi");
      expect(typeof tab.remoteTimestamp).toBe("number");
    } else {
      throw new Error("Expected isDiffTab to return true");
    }
  });
});

// ---------------------------------------------------------------------------
// createNewTab factory
// ---------------------------------------------------------------------------

describe("createNewTab", () => {
  it("produces an EditorTabState with tabKind 'editor'", () => {
    const tab = createNewTab();
    expect(tab.tabKind).toBe("editor");
    expect(isEditorTab(tab)).toBe(true);
  });

  it("initialises fileSyncStatus to 'clean'", () => {
    const tab = createNewTab();
    expect(tab.fileSyncStatus).toBe("clean");
  });

  it("initialises conflictDiskContent to null", () => {
    const tab = createNewTab();
    expect(tab.conflictDiskContent).toBeNull();
  });

  it("propagates content correctly", () => {
    const tab = createNewTab("initial content");
    expect(tab.content).toBe("initial content");
    expect(tab.lastSavedContent).toBe("initial content");
    expect(tab.isDirty).toBe(false);
  });

  it("respects the fileType parameter", () => {
    const tabMd = createNewTab(undefined, ".md");
    expect(tabMd.fileType).toBe(".md");

    const tabTxt = createNewTab(undefined, ".txt");
    expect(tabTxt.fileType).toBe(".txt");
  });

  it("generates a unique id on each call", () => {
    const ids = new Set(Array.from({ length: 20 }, () => createNewTab().id));
    expect(ids.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Tab union exhaustiveness
// ---------------------------------------------------------------------------

describe("TabState discriminated union", () => {
  it("exactly one type guard returns true for each tab kind", () => {
    const tabs: TabState[] = [makeEditorTab(), makeTerminalTab(), makeDiffTab()];
    for (const tab of tabs) {
      const matchCount = [isEditorTab(tab), isTerminalTab(tab), isDiffTab(tab)].filter(Boolean).length;
      expect(matchCount).toBe(1);
    }
  });

  it("can filter editor tabs from a mixed array", () => {
    const tabs: TabState[] = [
      makeEditorTab(),
      makeTerminalTab(),
      makeEditorTab({ content: "second editor" }),
      makeDiffTab(),
    ];
    const editorTabs = tabs.filter(isEditorTab);
    expect(editorTabs).toHaveLength(2);
    expect(editorTabs.every((t) => t.tabKind === "editor")).toBe(true);
  });

  it("all FileSyncStatus values are valid", () => {
    const statuses = ["clean", "dirty", "staleOnDisk", "conflicted"] as const;
    for (const status of statuses) {
      const tab = makeEditorTab({ fileSyncStatus: status });
      expect(tab.fileSyncStatus).toBe(status);
    }
  });

  it("all TerminalStatus values are valid", () => {
    const statuses = ["connecting", "running", "exited", "error"] as const;
    for (const status of statuses) {
      const tab = makeTerminalTab({ status });
      expect(tab.status).toBe(status);
    }
  });
});
