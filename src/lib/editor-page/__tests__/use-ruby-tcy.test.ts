import { act } from "react";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EditorCommand,
  EditorCommandResult,
  EditorInteractionHandle,
  ExistingRubySelection,
  SelectionToken,
} from "@/lib/editor-interaction";
import { useRubyTcy } from "../use-ruby-tcy";

function makeInteraction(): EditorInteractionHandle {
  return {
    getSnapshot: () => ({
      editorId: "editor-a",
      generation: 1,
      ready: true,
      active: true,
      focused: true,
      composing: false,
      documentFormat: "mdi",
      capabilities: { markdown: true, gfm: true, mdi: true, ruby: true, tcy: true },
      selection: {
        kind: "text",
        from: 1,
        to: 3,
        text: "漢字",
        anchor: null,
        head: null,
        rect: null,
        revision: 2,
        token: { editorId: "editor-a", generation: 1, selectionRevision: 2 },
        ruby: null,
      },
      availability: {
        "edit.undo": true,
        "edit.redo": true,
        "edit.cut": true,
        "edit.copy": true,
        "edit.paste": true,
        "edit.selectAll": true,
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
        "view.toggleWritingMode": true,
      },
    }),
    subscribe: () => () => {},
    execute: vi.fn<(command: EditorCommand, token?: SelectionToken) => EditorCommandResult>(() => ({
      status: "executed",
    })),
    createPosHighlightRequest: () => null,
    syncPosHighlightPresentation: () => {},
    prepareSearchSelection: () => undefined,
    querySearch: () => ({
      token: { editorId: "editor-a", generation: 1, contentRevision: 1 },
      matches: [],
    }),
    syncSearchPresentation: () => {},
    replaceSearch: () => ({ status: "unavailable" }),
  };
}

function HookHarness({
  getInteraction,
  state,
  apiRef,
}: {
  getInteraction: () => EditorInteractionHandle | null;
  state: {
    setRubySelectedText: (text: string) => void;
    setRubyInitialSelection: (selection: ExistingRubySelection | null) => void;
    setShowRubyDialog: (show: boolean) => void;
  };
  apiRef: React.MutableRefObject<ReturnType<typeof useRubyTcy> | null>;
}) {
  apiRef.current = useRubyTcy({
    getInteraction,
    setRubySelectedText: state.setRubySelectedText,
    setRubyInitialSelection: state.setRubyInitialSelection,
    setShowRubyDialog: state.setShowRubyDialog,
  });
  return null;
}

describe("useRubyTcy", () => {
  let root: Root;
  let container: HTMLDivElement;
  let apiRef: React.MutableRefObject<ReturnType<typeof useRubyTcy> | null>;
  let interaction: EditorInteractionHandle;
  let state: {
    setRubySelectedText: ReturnType<typeof vi.fn<(text: string) => void>>;
    setRubyInitialSelection: ReturnType<
      typeof vi.fn<(selection: ExistingRubySelection | null) => void>
    >;
    setShowRubyDialog: ReturnType<typeof vi.fn<(show: boolean) => void>>;
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiRef = { current: null };
    interaction = makeInteraction();
    state = {
      setRubySelectedText: vi.fn(),
      setRubyInitialSelection: vi.fn(),
      setShowRubyDialog: vi.fn(),
    };
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(getInteraction: () => EditorInteractionHandle | null = () => interaction) {
    act(() => {
      root.render(
        React.createElement(HookHarness, {
          getInteraction,
          state,
          apiRef,
        }),
      );
    });
  }

  it("opens the in-page dialog when the native bridge is unavailable", async () => {
    render();
    await act(async () => {
      await apiRef.current?.handleOpenRubyDialog();
    });
    expect(state.setRubySelectedText).toHaveBeenCalledWith("漢字");
    expect(state.setRubyInitialSelection).toHaveBeenCalledWith(null);
    expect(state.setShowRubyDialog).toHaveBeenCalledWith(true);
  });

  it("uses the native Ruby dialog when Electron exposes it", async () => {
    const openRubyDialog = vi.fn(async () => ({
      action: "apply" as const,
      segments: [{ base: "漢字", ruby: "かんじ" }],
    }));
    Object.assign(window, { electronAPI: { openRubyDialog } });
    render();
    await act(async () => {
      await apiRef.current?.handleOpenRubyDialog();
    });
    expect(openRubyDialog).toHaveBeenCalledWith({ selectedText: "漢字", existingRuby: null });
    expect(interaction.execute).toHaveBeenCalledWith(
      { id: "format.ruby", mode: "apply", segments: [{ base: "漢字", ruby: "かんじ" }] },
      { editorId: "editor-a", generation: 1, selectionRevision: 2 },
    );
    expect(state.setShowRubyDialog).toHaveBeenCalledWith(false);
  });

  it("applies remove through the captured token", () => {
    render();
    act(() => {
      void apiRef.current?.handleOpenRubyDialog();
    });
    act(() => {
      apiRef.current?.handleApplyRuby({ action: "remove" });
    });
    expect(interaction.execute).toHaveBeenCalledWith(
      { id: "format.ruby", mode: "remove" },
      { editorId: "editor-a", generation: 1, selectionRevision: 2 },
    );
  });

  it("no-ops when there is no active interaction", async () => {
    render(() => null);
    await act(async () => {
      await apiRef.current?.handleOpenRubyDialog();
    });
    expect(state.setRubySelectedText).not.toHaveBeenCalled();
  });
});
