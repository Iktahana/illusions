import { describe, expect, it } from "vitest";

import type { EditorInteractionSnapshot } from "../types";
import { computeActiveSelectionStats, emptyActiveSelectionStats } from "../selection-stats";

const baseSnapshot = (
  overrides: Partial<EditorInteractionSnapshot> = {},
): EditorInteractionSnapshot => ({
  editorId: "editor-selection-stats",
  generation: 1,
  ready: true,
  active: true,
  focused: true,
  composing: false,
  documentFormat: "markdown",
  capabilities: {
    markdown: true,
    gfm: true,
    mdi: false,
    ruby: false,
    tcy: false,
  },
  selection: {
    kind: "text",
    from: 3,
    to: 8,
    text: "東京\n大阪",
    anchor: { x: 10, y: 20 },
    head: { x: 40, y: 20 },
    rect: { left: 10, top: 20, right: 60, bottom: 40, width: 50, height: 20 },
    revision: 2,
    token: {
      editorId: "editor-selection-stats",
      generation: 1,
      selectionRevision: 2,
    },
    ruby: null,
  },
  availability: {
    "edit.undo": true,
    "edit.redo": true,
    "edit.cut": true,
    "edit.copy": true,
    "edit.paste": true,
    "edit.selectAll": true,
    "format.ruby": false,
    "format.strong": true,
    "format.emphasis": true,
    "format.strikethrough": true,
    "format.heading": true,
    "format.blockquote": true,
    "format.bulletList": true,
    "format.orderedList": true,
    "format.inlineCode": true,
    "format.clear": true,
    "format.tcy": true,
    "speech.toggle": true,
    "speech.stop": true,
    "view.toggleWritingMode": true,
  },
  ...overrides,
});

describe("computeActiveSelectionStats", () => {
  it.each([
    [".mdi", "mdi"],
    [".md", "markdown"],
    [".txt", "plain-text"],
  ] as const)(
    "counts visible selected text consistently for %s documents",
    (fileType, documentFormat) => {
      const snapshot = baseSnapshot({ documentFormat });

      expect(computeActiveSelectionStats(snapshot, fileType)).toEqual({
        selectedCharCount: 4,
        selectedManuscriptCells: 40,
        selectedManuscriptPages: 1,
        searchSelectionRange: { from: 3, to: 8 },
      });
    },
  );

  it("supports multi-block selections with manuscript stats", () => {
    const snapshot = baseSnapshot({
      selection: {
        ...baseSnapshot().selection,
        from: 2,
        to: 11,
        text: "第一段\n第二段",
      },
    });

    expect(computeActiveSelectionStats(snapshot, ".mdi")).toEqual({
      selectedCharCount: 6,
      selectedManuscriptCells: 40,
      selectedManuscriptPages: 1,
      searchSelectionRange: { from: 2, to: 11 },
    });
  });

  it("clears stats for caret, inactive panes, and external replacement-like empty selections", () => {
    const expected = emptyActiveSelectionStats();

    expect(
      computeActiveSelectionStats(
        baseSnapshot({
          selection: {
            ...baseSnapshot().selection,
            kind: "caret",
            from: 5,
            to: 5,
            text: "",
          },
        }),
        ".md",
      ),
    ).toEqual(expected);

    expect(computeActiveSelectionStats(baseSnapshot({ active: false }), ".mdi")).toEqual(expected);

    expect(
      computeActiveSelectionStats(
        baseSnapshot({
          selection: {
            ...baseSnapshot().selection,
            kind: "caret",
            from: 1,
            to: 1,
            text: "",
          },
        }),
        ".txt",
      ),
    ).toEqual(expected);
  });

  it("suppresses selection stats while IME composition is active", () => {
    expect(computeActiveSelectionStats(baseSnapshot({ composing: true }), ".mdi")).toEqual(
      emptyActiveSelectionStats(),
    );
  });

  it("returns empty stats before the active editor interaction is ready", () => {
    expect(computeActiveSelectionStats(null, ".md")).toEqual(emptyActiveSelectionStats());
    expect(computeActiveSelectionStats(baseSnapshot({ ready: false }), ".txt")).toEqual(
      emptyActiveSelectionStats(),
    );
  });
});
