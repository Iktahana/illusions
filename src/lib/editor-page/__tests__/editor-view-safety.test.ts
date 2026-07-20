import { describe, expect, it, vi } from "vitest";
import type { Transaction } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import {
  dispatchIfEditorViewAlive,
  isEditorViewAlive,
  isEditorViewTeardownError,
} from "@/shared/lib/editor-view-safety";

function makeView(options: { alive?: boolean; dispatch?: () => void } = {}): EditorView {
  const dispatch = vi.fn(options.dispatch ?? (() => {}));
  return {
    docView: options.alive === false ? null : {},
    dispatch,
  } as unknown as EditorView;
}

describe("editor-view-safety", () => {
  it("detects ProseMirror views destroyed during Milkdown teardown", () => {
    expect(isEditorViewAlive(makeView())).toBe(true);
    expect(isEditorViewAlive(makeView({ alive: false }))).toBe(false);
    expect(isEditorViewAlive(null)).toBe(false);
  });

  it("does not build or dispatch transactions for destroyed views", () => {
    const view = makeView({ alive: false });
    const createTransaction = vi.fn();

    expect(dispatchIfEditorViewAlive(view, createTransaction)).toBe(false);
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("suppresses known teardown errors from stale dispatches", () => {
    const editorStateError = new Error(
      'Context "editorState" not found, do you forget to inject it?',
    );
    const nextSiblingError = new TypeError(
      "Cannot read properties of null (reading 'nextSibling')",
    );

    expect(isEditorViewTeardownError(editorStateError)).toBe(true);
    expect(isEditorViewTeardownError(nextSiblingError)).toBe(true);
    expect(
      dispatchIfEditorViewAlive(
        makeView({
          dispatch: () => {
            throw editorStateError;
          },
        }),
        () => ({}) as Transaction,
      ),
    ).toBe(false);
    expect(
      dispatchIfEditorViewAlive(
        makeView({
          dispatch: () => {
            throw nextSiblingError;
          },
        }),
        () => ({}) as Transaction,
      ),
    ).toBe(false);
  });

  it("rethrows unexpected dispatch errors", () => {
    const unexpected = new Error("schema exploded");
    expect(() =>
      dispatchIfEditorViewAlive(
        makeView({
          dispatch: () => {
            throw unexpected;
          },
        }),
        () => ({}) as Transaction,
      ),
    ).toThrow(unexpected);
  });
});
