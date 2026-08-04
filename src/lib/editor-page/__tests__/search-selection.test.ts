import { describe, expect, it } from "vitest";
import { EditorState, TextSelection, type Transaction } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { Schema } from "@milkdown/prose/model";

import { selectedEditorTextForSearch, takeEditorSelectionForSearch } from "../search-selection";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: { group: "inline" },
  },
});

describe("selectedEditorTextForSearch", () => {
  it("returns the selected text before search moves focus away from the editor (#2218)", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("選択テキスト")),
    ]);
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 7),
    });

    expect(selectedEditorTextForSearch(state)).toBe("選択テキスト");
  });

  it("does not replace an existing query when the editor has no selected text", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, schema.text("本文"))]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });

    expect(selectedEditorTextForSearch(state)).toBeUndefined();
  });

  it("captures text then collapses the editor range before another control takes focus", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("選択テキスト")),
    ]);
    const initialState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 7),
    });
    const fakeView = {
      state: initialState,
      docView: {},
      dispatch(transaction: Transaction) {
        fakeView.state = fakeView.state.apply(transaction);
      },
    };
    const view = fakeView as unknown as EditorView;

    expect(takeEditorSelectionForSearch(view)).toBe("選択テキスト");
    expect(fakeView.state.selection.empty).toBe(true);
    expect(fakeView.state.selection.from).toBe(7);
  });
});
