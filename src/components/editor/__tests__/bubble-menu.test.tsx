import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorCommand, EditorInteractionHandle, SelectionToken } from "@/lib/editor-interaction";

const interaction = vi.hoisted(() => ({
  handle: { execute: vi.fn(() => ({ status: "executed" })) },
  snapshot: {
    ready: true,
    documentFormat: "markdown",
    composing: false,
    availability: {
      "format.ruby": true,
      "format.tcy": true,
      "format.strong": true,
      "format.emphasis": true,
      "format.strikethrough": true,
      "format.heading": true,
      "format.blockquote": true,
      "format.bulletList": true,
      "format.orderedList": true,
      "format.inlineCode": true,
      "format.clear": true,
    },
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
  let editorSurface: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    editorSurface = document.createElement("div");
    Object.defineProperty(editorSurface, "getBoundingClientRect", {
      value: () => ({
        left: 200,
        top: 40,
        right: 520,
        bottom: 240,
        width: 320,
        height: 200,
      }),
    });
    root = createRoot(container);
    interaction.handle.execute.mockReset().mockReturnValue({ status: "executed" });
    Object.assign(interaction.snapshot, {
      ready: true,
      documentFormat: "markdown",
      composing: false,
    });
    Object.assign(interaction.snapshot.availability, {
      "format.ruby": true,
      "format.tcy": true,
      "format.strong": true,
      "format.emphasis": true,
      "format.strikethrough": true,
      "format.heading": true,
      "format.blockquote": true,
      "format.bulletList": true,
      "format.orderedList": true,
      "format.inlineCode": true,
      "format.clear": true,
    });
    Object.assign(interaction.snapshot.selection, { kind: "text", revision: 2 });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = (
    vertical = false,
    onEditorCommand?: (
      handle: EditorInteractionHandle,
      command: EditorCommand,
      token?: SelectionToken,
    ) => void,
  ) =>
    act(() =>
      root.render(
        <BubbleMenu
          isVertical={vertical}
          editorSurface={{ current: editorSurface }}
          onEditorCommand={onEditorCommand}
        />,
      ),
    );
  const renderWithoutSurface = (vertical = false) =>
    act(() => root.render(<BubbleMenu isVertical={vertical} />));

  it("shows every formatting command for a current rich-text selection", () => {
    render(false, vi.fn());
    expect(container.querySelector('[aria-label="選択範囲の書式"]')).not.toBeNull();
    for (const name of [
      "ルビを設定",
      "縦中横を切替",
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

  it("hides the Ruby action when no shared prompt callback is available", () => {
    render();
    expect(container.querySelector('button[aria-label="ルビを設定"]')).toBeNull();
    expect(container.querySelector('button[aria-label="縦中横を切替"]')).not.toBeNull();
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

  it("hides commands that are unavailable for the current snapshot", () => {
    interaction.snapshot.availability["format.tcy"] = false;
    render();
    expect(container.querySelector('button[aria-label="縦中横を切替"]')).toBeNull();
    expect(container.querySelector('button[aria-label="太字"]')).not.toBeNull();
    interaction.snapshot.availability["format.tcy"] = true;
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

  it("routes Ruby actions through the shared prompt callback", () => {
    const onEditorCommand = vi.fn();
    render(false, onEditorCommand);
    act(() =>
      (container.querySelector('button[aria-label="ルビを設定"]') as HTMLButtonElement).click(),
    );
    expect(onEditorCommand).toHaveBeenCalledWith(
      interaction.handle,
      { id: "format.ruby", mode: "apply", segments: [] },
      interaction.snapshot.selection.token,
    );
    expect(interaction.handle.execute).not.toHaveBeenCalled();
  });

  it("places vertical controls on the read side and clamps to the viewport", () => {
    Object.assign(interaction.snapshot.selection.rect, { left: 2, right: 12, top: 2 });
    render(true);
    const menu = container.querySelector('[aria-label="選択範囲の書式"]') as HTMLElement;
    expect(menu.style.left).toBe("208px");
    expect(menu.style.top).toBe("48px");
  });

  it("clamps horizontal controls inside the editor viewport", () => {
    Object.assign(interaction.snapshot.selection.rect, { left: 4, right: 340, top: 50 });
    render(false);
    const menu = container.querySelector('[aria-label="選択範囲の書式"]') as HTMLElement;
    expect(menu.style.left).toBe("208px");
    expect(menu.style.top).toBe("48px");
  });

  it("falls back to the window viewport and preserves the captured selection on mousedown", () => {
    Object.assign(interaction.snapshot.selection.rect, { left: 280, right: 320, top: 12 });
    Object.defineProperty(window, "innerWidth", { value: 360, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 200, configurable: true });
    renderWithoutSurface(false);
    const menu = container.querySelector('[aria-label="選択範囲の書式"]') as HTMLElement;
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    menu.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(menu.style.left).toBe("8px");
    expect(menu.style.top).toBe("8px");
  });
});
