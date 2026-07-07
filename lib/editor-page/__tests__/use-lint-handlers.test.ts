/**
 * Tests for useLintHandlers — issue-text extraction for the lint UI actions.
 *
 * #2047: issue positions held in React state are frozen at lint-dispatch time
 * and are NOT remapped when the document changes. Re-slicing the current
 * document with those stale positions returned drifted garbage (e.g.
 * 「。 フガピ」 instead of 「フガピヨ」) from the correction card's
 * 「この語をユーザー辞書に追加」action. The handlers must prefer the
 * detection-time `originalText` recorded by the lint pipeline and only fall
 * back to document extraction when it is absent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import type { EditorView } from "@milkdown/prose/view";
import type { LintIssue } from "@/lib/linting/types";

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { useLintHandlers } from "../use-lint-handlers";

/**
 * Minimal EditorView stand-in: the document is a flat string and textBetween
 * is a plain slice. Tests emulate #2047's position drift by giving issues
 * from/to values that no longer point at the flagged word in this string.
 */
function makeView(docText: string): EditorView {
  return {
    state: {
      doc: {
        content: { size: docText.length },
        textBetween: (from: number, to: number) => docText.slice(from, to),
        descendants: () => {},
      },
      selection: { from: 0 },
    },
    dom: document.createElement("div"),
  } as unknown as EditorView;
}

function makeIssue(overrides: Partial<LintIssue>): LintIssue {
  return {
    ruleId: "genji-out-of-dict",
    severity: "info",
    message: "Out-of-dictionary word",
    messageJa: "辞書外語",
    from: 0,
    to: 0,
    ...overrides,
  };
}

// Repro from #2047: a sentence, a newline, then the flagged word used again.
// The word フガピヨ currently sits at [6, 10), but the issue carries stale
// positions [4, 8) — two characters back — spanning the preceding 。 + newline.
const DOC_TEXT = "フガピヨ。\nフガピヨを使う。";
const STALE_FROM = 4;
const STALE_TO = 8;
const DRIFTED_SLICE = DOC_TEXT.slice(STALE_FROM, STALE_TO); // 「。\nフガ」

let root: Root | null = null;

function setup(view: EditorView | null, lintIssues: LintIssue[]) {
  const ignoreCorrection = vi.fn();
  const addWordToUserDictionary = vi.fn(async () => {});
  const triggerSwitchToCorrections = vi.fn();
  const capturedRef: { current: ReturnType<typeof useLintHandlers> | null } = { current: null };

  function Probe() {
    // Capture the hook return into an outer ref so the test can drive it.
    // Not a production render pattern.
    // eslint-disable-next-line react-hooks/immutability
    capturedRef.current = useLintHandlers({
      editorViewInstance: view,
      lintIssues,
      ignoreCorrection,
      addWordToUserDictionary,
      triggerSwitchToCorrections,
    });
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => {
    root!.render(React.createElement(Probe));
  });
  return {
    handlers: capturedRef.current!,
    ignoreCorrection,
    addWordToUserDictionary,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

describe("useLintHandlers — issue text extraction (#2047)", () => {
  it("adds the detection-time originalText to the user dictionary, not a stale-position slice", () => {
    const issue = makeIssue({ from: STALE_FROM, to: STALE_TO, originalText: "フガピヨ" });
    const { handlers, addWordToUserDictionary } = setup(makeView(DOC_TEXT), [issue]);

    handlers.handleAddToUserDictionary(issue);

    expect(addWordToUserDictionary).toHaveBeenCalledTimes(1);
    expect(addWordToUserDictionary).toHaveBeenCalledWith("フガピヨ");
    expect(addWordToUserDictionary).not.toHaveBeenCalledWith(DRIFTED_SLICE);
  });

  it("falls back to extracting from the document when originalText is absent", () => {
    const issue = makeIssue({ from: 6, to: 10 }); // current position of フガピヨ
    const { handlers, addWordToUserDictionary } = setup(makeView(DOC_TEXT), [issue]);

    handlers.handleAddToUserDictionary(issue);

    expect(addWordToUserDictionary).toHaveBeenCalledWith("フガピヨ");
  });

  it("ignores a correction by its detection-time originalText, not a stale-position slice", () => {
    const issue = makeIssue({ from: STALE_FROM, to: STALE_TO, originalText: "フガピヨ" });
    const { handlers, ignoreCorrection } = setup(makeView(DOC_TEXT), [issue]);

    handlers.handleIgnoreCorrection(issue, true);

    expect(ignoreCorrection).toHaveBeenCalledWith("genji-out-of-dict", "フガピヨ");
  });

  it("enrichedLintIssues preserves a pre-existing originalText instead of clobbering it", () => {
    const issue = makeIssue({ from: STALE_FROM, to: STALE_TO, originalText: "フガピヨ" });
    const { handlers } = setup(makeView(DOC_TEXT), [issue]);

    expect(handlers.enrichedLintIssues[0].originalText).toBe("フガピヨ");
    expect(handlers.enrichedLintIssues[0].originalText).not.toBe(DRIFTED_SLICE);
  });

  it("enrichedLintIssues fills originalText from the document when absent", () => {
    const issue = makeIssue({ from: 6, to: 10 });
    const { handlers } = setup(makeView(DOC_TEXT), [issue]);

    expect(handlers.enrichedLintIssues[0].originalText).toBe("フガピヨ");
  });
});
