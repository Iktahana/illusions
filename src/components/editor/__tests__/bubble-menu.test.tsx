import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const interaction = vi.hoisted(() => ({
  handle: { execute: vi.fn(() => ({ status: "executed" })) },
  snapshot: {
    ready: true,
    documentFormat: "markdown",
    composing: false,
    selection: {
      kind: "text",
      revision: 2,
      rect: { left: 100, top: 100, right: 200, bottom: 120, width: 100, height: 20 },
      token: { editorId: "a", generation: 1, selectionRevision: 2 },
    },
  },
}));

vi.mock("@/lib/editor-interaction/context", () => ({ useEditorInteraction: () => interaction }));
import BubbleMenu from "../BubbleMenu";

describe("BubbleMenu", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    interaction.handle.execute.mockReset().mockReturnValue({ status: "executed" });
    Object.assign(interaction.snapshot, {
      ready: true,
      documentFormat: "markdown",
      composing: false,
    });
    Object.assign(interaction.snapshot.selection, { kind: "text", revision: 2 });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = (vertical = false) => act(() => root.render(<BubbleMenu isVertical={vertical} />));

  it("shows every formatting command for a current rich-text selection", () => {
    render();
    expect(container.querySelector('[aria-label="選択範囲の書式"]')).not.toBeNull();
    for (const name of [
      "太字",
      "斜体",
      "取り消し線",
      "見出し1",
      "引用",
      "箇条書き",
      "番号付きリスト",
      "インラインコード",
      "書式をクリア",
    ])
      expect(container.querySelector(`button[aria-label="${name}"]`)).not.toBeNull();
  });

  it("does not exist for caret, plain text, composition, or disposed editors", () => {
    for (const change of [
      { selection: { kind: "caret" } },
      { documentFormat: "plain-text" },
      { composing: true },
      { ready: false },
    ]) {
      Object.assign(interaction.snapshot, {
        ready: true,
        documentFormat: "markdown",
        composing: false,
      });
      Object.assign(interaction.snapshot.selection, {
        kind: "text",
        revision: interaction.snapshot.selection.revision + 1,
      });
      if (change.selection) Object.assign(interaction.snapshot.selection, change.selection);
      else Object.assign(interaction.snapshot, change);
      render();
      expect(container.querySelector('[aria-label="選択範囲の書式"]')).toBeNull();
    }
  });

  it("executes with the captured token and closes on a stale result", () => {
    interaction.handle.execute.mockReturnValue({ status: "stale" });
    render();
    act(() => (container.querySelector('button[aria-label="太字"]') as HTMLButtonElement).click());
    expect(interaction.handle.execute).toHaveBeenCalledWith(
      { id: "format.strong" },
      interaction.snapshot.selection.token,
    );
    expect(container.querySelector('[aria-label="選択範囲の書式"]')).toBeNull();
  });

  it("places vertical controls on the read side and clamps to the viewport", () => {
    Object.assign(interaction.snapshot.selection.rect, { left: 2, top: 2 });
    render(true);
    const menu = container.querySelector('[aria-label="選択範囲の書式"]') as HTMLElement;
    expect(menu.style.left).toBe("8px");
    expect(menu.style.top).toBe("8px");
  });
});
