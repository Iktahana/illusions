import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentFormat } from "@/lib/document-format";

const mocks = vi.hoisted(() => {
  type Command =
    | { kind: "line-length"; value: number | null }
    | { kind: "replace-all"; value: string }
    | { kind: "writing-mode"; value: string };

  interface FakeEditor {
    action: ReturnType<typeof vi.fn>;
    ctx: { get: ReturnType<typeof vi.fn> };
  }

  const runtime: Record<DocumentFormat, { editor: FakeEditor | null; loading: boolean }> = {
    mdi: { editor: null, loading: true },
    markdown: { editor: null, loading: true },
    "plain-text": { editor: null, loading: true },
  };

  const adapter = (format: DocumentFormat) => ({
    format,
    configureEditor: (editor: unknown) => editor,
    encodeEditor: vi.fn(() => "encoded"),
  });
  const adapters = {
    mdi: adapter("mdi"),
    markdown: adapter("markdown"),
    "plain-text": adapter("plain-text"),
  };

  const makeEditor = (viewId: string): FakeEditor => ({
    action: vi.fn((command: Command) => command),
    ctx: { get: vi.fn(() => ({ id: viewId, state: { doc: {} } })) },
  });

  return { adapters, makeEditor, runtime };
});

vi.mock("@/contexts/EditorSettingsContext", () => ({
  useTypographySettings: () => ({
    fontFamily: "Noto Serif JP",
    fontScale: 100,
    lineHeight: 1.8,
    paragraphSpacing: 0.5,
    showParagraphNumbers: false,
    textIndent: 1,
  }),
}));

vi.mock("@/lib/document-format", () => ({
  getDocumentAdapter: (format: DocumentFormat) => mocks.adapters[format],
}));

vi.mock("@milkdown/react", () => ({
  Milkdown: () => <div data-testid="milkdown" />,
  useEditor: (_factory: unknown, deps: readonly unknown[]) => {
    const format = deps[1] as DocumentFormat;
    return {
      get: () => mocks.runtime[format].editor,
      loading: mocks.runtime[format].loading,
    };
  },
}));

vi.mock("@milkdown/core", () => ({
  Editor: { make: vi.fn() },
  defaultValueCtx: Symbol("defaultValueCtx"),
  editorViewCtx: Symbol("editorViewCtx"),
  rootCtx: Symbol("rootCtx"),
  serializerCtx: Symbol("serializerCtx"),
}));

vi.mock("@milkdown/plugin-clipboard", () => ({ clipboard: Symbol("clipboard") }));
vi.mock("@milkdown/plugin-history", () => ({ history: Symbol("history") }));
vi.mock("@milkdown/plugin-listener", () => ({
  listener: Symbol("listener"),
  listenerCtx: Symbol("listenerCtx"),
}));
vi.mock("@milkdown/preset-commonmark", () => ({ commonmark: Symbol("commonmark") }));
vi.mock("@milkdown/theme-nord", () => ({ nord: Symbol("nord") }));
vi.mock("@milkdown/utils", () => ({
  $prose: vi.fn(() => Symbol("prose")),
  replaceAll: (value: string) => ({ kind: "replace-all", value }),
}));
vi.mock("@illusions-lab/milkdown-plugin-vertical-writing", () => ({
  changeLineLength: (value: number | null) => ({ kind: "line-length", value }),
  changeWritingMode: (value: string) => ({ kind: "writing-mode", value }),
  verticalWriting: vi.fn(() => Symbol("verticalWriting")),
}));

import MilkdownEditor from "../MilkdownEditor";

const baseProps = {
  documentFormat: "mdi" as DocumentFormat,
  initialContent: "initial",
  isVertical: false,
  lineLength: 40,
};

describe("MilkdownEditor initialization lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (props: Partial<React.ComponentProps<typeof MilkdownEditor>> = {}) => {
    act(() => root.render(<MilkdownEditor {...baseProps} {...props} />));
  };

  const finishCreation = (format: DocumentFormat, viewId: string = format) => {
    const editor = mocks.makeEditor(viewId);
    mocks.runtime[format] = { editor, loading: false };
    return editor;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    for (const format of ["mdi", "markdown", "plain-text"] as const) {
      mocks.runtime[format] = { editor: null, loading: true };
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("waits for the first editor view before applying writing settings", () => {
    const onEditorViewReady = vi.fn();
    render({ onEditorViewReady });
    act(() => vi.runAllTimers());

    const editor = finishCreation("mdi", "first");
    render({ onEditorViewReady });
    act(() => vi.runAllTimers());

    const commands = editor.action.mock.calls.map(([command]) => command);
    expect(commands.slice(0, 2)).toEqual([
      { kind: "writing-mode", value: "horizontal-tb" },
      { kind: "line-length", value: 40 },
    ]);
    expect(commands[2]).toEqual(expect.any(Function));
    expect(onEditorViewReady).toHaveBeenCalledWith(expect.objectContaining({ id: "first" }));
  });

  it("repeats the readiness gate after an unmount and remount", () => {
    const first = finishCreation("mdi", "first");
    render();
    act(() => vi.runAllTimers());
    expect(first.action).toHaveBeenCalled();

    act(() => root.render(<></>));
    mocks.runtime.mdi = { editor: null, loading: true };
    render();
    act(() => vi.runAllTimers());

    const second = finishCreation("mdi", "second");
    render();
    act(() => vi.runAllTimers());
    expect(second.action).toHaveBeenCalledWith({
      kind: "writing-mode",
      value: "horizontal-tb",
    });
  });

  it("applies horizontal and vertical switches only to a ready editor", () => {
    const editor = finishCreation("mdi");
    render();
    act(() => vi.runAllTimers());
    editor.action.mockClear();

    render({ isVertical: true });

    expect(editor.action).toHaveBeenCalledTimes(1);
    expect(editor.action).toHaveBeenCalledWith({
      kind: "writing-mode",
      value: "vertical-rl",
    });
  });

  it("does not reuse readiness from the previous document format", () => {
    const mdiEditor = finishCreation("mdi");
    render();
    act(() => vi.runAllTimers());
    mdiEditor.action.mockClear();

    // Milkdown exposes the previous editor for one commit before the child
    // creation effect flips `loading` back to true. Generation readiness must
    // prevent commands from reaching that stale context in this window.
    mocks.runtime.markdown = { editor: mdiEditor, loading: false };
    render({ documentFormat: "markdown" });
    expect(mdiEditor.action).not.toHaveBeenCalled();

    mocks.runtime.markdown = { editor: mdiEditor, loading: true };
    render({ documentFormat: "markdown" });
    act(() => vi.runAllTimers());
    expect(mdiEditor.action).not.toHaveBeenCalled();

    const markdownEditor = finishCreation("markdown");
    render({ documentFormat: "markdown" });
    act(() => vi.runAllTimers());
    expect(markdownEditor.action).toHaveBeenCalledWith({
      kind: "writing-mode",
      value: "horizontal-tb",
    });
  });

  it("defers external replacement until the new editor view is ready", () => {
    const onExternalContentApplied = vi.fn();
    render({ externalContent: "replacement", onExternalContentApplied });
    act(() => vi.runAllTimers());
    expect(onExternalContentApplied).not.toHaveBeenCalled();

    const editor = finishCreation("mdi");
    render({ externalContent: "replacement", onExternalContentApplied });
    act(() => vi.runAllTimers());

    expect(editor.action).toHaveBeenCalledWith({
      kind: "replace-all",
      value: "replacement",
    });
    expect(onExternalContentApplied).toHaveBeenCalledTimes(1);
  });
});
