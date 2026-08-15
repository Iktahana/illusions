import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const instances: Array<{
    editorId: string;
    documentFormat: string;
    adapter: unknown;
    setActive: ReturnType<typeof vi.fn>;
    getSnapshot: ReturnType<typeof vi.fn>;
  }> = [];
  return {
    typography: { charsPerLine: 42 },
    writingMode: "vertical" as "vertical" | "horizontal",
    instances,
    trackUsageEvent: vi.fn(),
    setWritingMode: vi.fn(),
    buildEditorContextMenu: vi.fn((_availability?: Record<string, boolean>) => [
      { command: "edit.copy", enabled: true },
    ]),
    milkdownProps: null as Record<string, unknown> | null,
    bubbleProps: null as Record<string, unknown> | null,
  };
});

vi.mock("@milkdown/react", () => ({
  MilkdownProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@prosemirror-adapter/react", () => ({
  ProsemirrorAdapterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/contexts/EditorSettingsContext", () => ({
  useTypographySettings: () => mockState.typography,
}));
vi.mock("@/lib/analytics/usage-events", () => ({
  trackUsageEvent: (...args: unknown[]) => mockState.trackUsageEvent(...args),
}));
vi.mock("@/lib/storage/local-preferences", () => ({
  localPreferences: {
    getWritingMode: () => mockState.writingMode,
    setWritingMode: (value: "vertical" | "horizontal") => mockState.setWritingMode(value),
  },
}));
vi.mock("@/lib/document-format", () => ({
  getDocumentAdapter: (format: string) => ({
    format,
    capabilities: { markdown: format !== "plain-text" },
  }),
}));
vi.mock("@/lib/editor-interaction", () => ({
  EditorInteractionStore: class MockInteractionStore {
    editorId: string;
    documentFormat: string;
    adapter: unknown;
    setActive = vi.fn();
    getSnapshot = vi.fn(() => ({ availability: { "edit.copy": true, "edit.undo": true } }));

    constructor(editorId: string, documentFormat: string, adapter: unknown) {
      this.editorId = editorId;
      this.documentFormat = documentFormat;
      this.adapter = adapter;
      mockState.instances.push(this);
    }
  },
  buildEditorContextMenu: (availability: Record<string, boolean>) =>
    mockState.buildEditorContextMenu(availability),
}));
vi.mock("@/lib/editor-interaction/context", () => ({
  EditorInteractionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../editor/MilkdownEditor", () => ({
  default: (props: Record<string, unknown>) => {
    mockState.milkdownProps = props;
    return <div data-testid="milkdown-editor" />;
  },
}));
vi.mock("../editor/EditorToolbar", () => ({
  default: ({
    isVertical,
    onToggleWritingMode,
  }: {
    isVertical: boolean;
    onToggleWritingMode: () => void;
  }) => (
    <button
      type="button"
      aria-label={isVertical ? "横書きに切り替え" : "縦書きに切り替え"}
      data-testid="editor-toolbar-toggle"
      onClick={onToggleWritingMode}
    >
      toggle
    </button>
  ),
}));
vi.mock("../editor/BubbleMenu", () => ({
  default: (props: Record<string, unknown>) => {
    mockState.bubbleProps = props;
    return <div data-testid="bubble-menu" />;
  },
}));

import NovelEditor from "../Editor";

describe("NovelEditor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockState.typography.charsPerLine = 42;
    mockState.writingMode = "vertical";
    mockState.instances.length = 0;
    mockState.trackUsageEvent.mockReset();
    mockState.setWritingMode.mockReset();
    mockState.buildEditorContextMenu.mockClear();
    mockState.milkdownProps = null;
    mockState.bubbleProps = null;
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("registers the active interaction and keeps writing mode in the editor-owned flow", () => {
    const registerInteraction = vi.fn();
    const registerWritingModeToggle = vi.fn();
    act(() =>
      root.render(
        <NovelEditor
          documentFormat="markdown"
          className="custom-shell"
          initialContent="原稿"
          active
          registerInteraction={registerInteraction}
          registerWritingModeToggle={registerWritingModeToggle}
        />,
      ),
    );

    const interaction = mockState.instances.at(-1);
    expect(interaction?.setActive).toHaveBeenCalledWith(true);
    expect(registerInteraction).toHaveBeenCalledWith(interaction);
    expect(registerWritingModeToggle).toHaveBeenCalledWith(expect.any(Function));
    expect(mockState.milkdownProps).toMatchObject({
      initialContent: "原稿",
      documentFormat: "markdown",
      isVertical: true,
      lineLength: 42,
      interaction,
    });
    expect(mockState.bubbleProps).toMatchObject({ isVertical: true });
    expect(container.firstElementChild?.className).toContain("custom-shell");

    act(() =>
      (
        container.querySelector('[data-testid="editor-toolbar-toggle"]') as HTMLButtonElement
      ).click(),
    );

    expect(mockState.trackUsageEvent).toHaveBeenCalledWith("editor_layout_changed", {
      action: "writing_mode",
      value: "horizontal",
    });
    expect(mockState.setWritingMode).toHaveBeenLastCalledWith("horizontal");
    expect(mockState.milkdownProps).toMatchObject({ isVertical: false });
    expect(mockState.bubbleProps).toMatchObject({ isVertical: false });

    act(() => root.unmount());
    expect(registerInteraction).toHaveBeenLastCalledWith(null);
    expect(registerWritingModeToggle).toHaveBeenLastCalledWith(null);
  });

  it("skips active-handle registration for inactive panes and falls back to null line length", () => {
    mockState.typography.charsPerLine = 0;
    const registerInteraction = vi.fn();
    act(() =>
      root.render(
        <NovelEditor
          documentFormat="plain-text"
          active={false}
          registerInteraction={registerInteraction}
        />,
      ),
    );

    const interaction = mockState.instances.at(-1);
    expect(interaction?.setActive).toHaveBeenCalledWith(false);
    expect(registerInteraction).not.toHaveBeenCalled();
    expect(mockState.milkdownProps).toMatchObject({
      documentFormat: "plain-text",
      lineLength: null,
    });
  });

  it("routes editor context menus through the Electron bridge only when available", () => {
    const showEditorContextMenu = vi.fn();
    Object.assign(window, {
      electronAPI: { showEditorContextMenu },
    });
    act(() => root.render(<NovelEditor documentFormat="markdown" />));

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    container.firstElementChild?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(mockState.buildEditorContextMenu).toHaveBeenCalledWith({
      "edit.copy": true,
      "edit.undo": true,
    });
    expect(showEditorContextMenu).toHaveBeenCalledWith([{ command: "edit.copy", enabled: true }]);

    showEditorContextMenu.mockClear();
    mockState.buildEditorContextMenu.mockClear();
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    const noBridgeEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    container.firstElementChild?.dispatchEvent(noBridgeEvent);
    expect(noBridgeEvent.defaultPrevented).toBe(false);
    expect(mockState.buildEditorContextMenu).not.toHaveBeenCalled();
    expect(showEditorContextMenu).not.toHaveBeenCalled();
  });
});
