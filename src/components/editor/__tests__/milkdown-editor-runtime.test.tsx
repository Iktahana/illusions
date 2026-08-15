import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MilkdownProvider } from "@milkdown/react";
import type { EditorView } from "@milkdown/prose/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDocumentAdapter, type DocumentFormat } from "@/lib/document-format";
import { computeActiveSelectionStats, EditorInteractionStore } from "@/lib/editor-interaction";

let showParagraphNumbers = false;

vi.mock("@/contexts/EditorSettingsContext", () => ({
  useTypographySettings: () => ({
    fontFamily: "Noto Serif JP",
    fontScale: 100,
    lineHeight: 1.8,
    paragraphSpacing: 0.5,
    showParagraphNumbers,
    textIndent: 1,
  }),
}));

import MilkdownEditor from "../MilkdownEditor";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface RuntimeProps {
  documentFormat: DocumentFormat;
  externalContent?: string | null;
  initialContent: string;
  isVertical: boolean;
  lineLength: number | null;
  onEditorViewReady?: (view: EditorView) => void;
  onExternalContentApplied?: () => void;
  registerFlush?: (flush: (() => string | null) | null) => void;
  interaction?: EditorInteractionStore;
}

async function waitFor(assertion: () => void, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
  }

  throw lastError;
}

function runFlush(flush: (() => string | null) | null): string | null {
  if (!flush) throw new Error("editor flush callback is not registered");
  return flush();
}

describe("MilkdownEditor real runtime", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (props: RuntimeProps): Promise<void> => {
    await act(async () => {
      root.render(
        <MilkdownProvider>
          <MilkdownEditor {...props} />
        </MilkdownProvider>,
      );
    });
  };

  beforeEach(() => {
    showParagraphNumbers = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("mounts the published MDI and vertical-writing packages, edits, replaces, and flushes", async () => {
    await getDocumentAdapter("mdi").initialize();
    const readyViews: EditorView[] = [];
    let flush: (() => string | null) | null = null;
    const registerFlush = (next: (() => string | null) | null): void => {
      flush = next;
    };
    const initial = "{東京|とうきょう}と^12^。\n";
    const baseProps: RuntimeProps = {
      documentFormat: "mdi",
      initialContent: initial,
      isVertical: false,
      lineLength: 40,
      onEditorViewReady: (view) => readyViews.push(view),
      registerFlush,
    };

    await render(baseProps);
    await waitFor(() => expect(readyViews).toHaveLength(1));
    await waitFor(() => expect(flush).not.toBeNull());

    const firstView = readyViews[0];
    expect(firstView.state.doc.textContent).toBe("と12。");
    expect(container.querySelector("ruby[data-mdi-ruby]")).not.toBeNull();
    expect(runFlush(flush)).toBe(initial);

    await act(async () => {
      firstView.dispatch(firstView.state.tr.insertText("追記", firstView.state.doc.content.size));
    });
    expect(runFlush(flush)).toContain("追記");

    await render({ ...baseProps, isVertical: true, lineLength: 28 });
    await waitFor(() => {
      const pluginRoot = container.querySelector(".milkdown-vertical-writing") as HTMLElement;
      expect(pluginRoot.dataset.writingMode).toBe("vertical-rl");
      expect(pluginRoot.dataset.lineLength).toBe("28");
    });
    expect(readyViews[0]).toBe(firstView);

    const replacement = "{大阪|おおさか}へ。\n";
    const onExternalContentApplied = vi.fn();
    await render({
      ...baseProps,
      externalContent: replacement,
      isVertical: true,
      lineLength: 28,
      onExternalContentApplied,
    });
    await waitFor(() => expect(onExternalContentApplied).toHaveBeenCalled());
    expect(runFlush(flush)).toBe(replacement);
  });

  it("clears selection-derived stats after external replacement in the current runtime", async () => {
    await getDocumentAdapter("markdown").initialize();
    const adapter = getDocumentAdapter("markdown");
    const interaction = new EditorInteractionStore("selection-stats-runtime", "markdown", adapter);
    const views: EditorView[] = [];

    await render({
      documentFormat: "markdown",
      initialContent: "一二\n\n三四",
      isVertical: false,
      lineLength: 40,
      onEditorViewReady: (view) => views.push(view),
      interaction,
    });

    await waitFor(() => expect(views).toHaveLength(1));

    await act(async () => {
      expect(interaction.execute({ id: "edit.selectAll" })).toEqual({ status: "executed" });
      interaction.update();
    });

    await waitFor(() =>
      expect(computeActiveSelectionStats(interaction.getSnapshot(), ".md")).toMatchObject({
        selectedCharCount: 4,
        selectedManuscriptCells: 40,
        selectedManuscriptPages: 1,
        searchSelectionRange: expect.any(Object),
      }),
    );

    const onExternalContentApplied = vi.fn();
    await render({
      documentFormat: "markdown",
      initialContent: "一二\n\n三四",
      externalContent: "差し替え後",
      isVertical: false,
      lineLength: 40,
      onEditorViewReady: (view) => views.push(view),
      onExternalContentApplied,
      interaction,
    });

    await waitFor(() => expect(onExternalContentApplied).toHaveBeenCalled());
    await waitFor(() =>
      expect(computeActiveSelectionStats(interaction.getSnapshot(), ".md")).toEqual({
        selectedCharCount: 0,
        selectedManuscriptCells: 0,
        selectedManuscriptPages: 0,
        searchSelectionRange: null,
      }),
    );
    expect(interaction.getSnapshot()).toMatchObject({
      generation: 1,
      selection: { kind: "caret", from: 1, to: 1, text: "" },
    });
  });

  it("recreates the real editor for a format switch without applying commands to the old view", async () => {
    await getDocumentAdapter("mdi").initialize();
    const views: EditorView[] = [];
    let flush: (() => string | null) | null = null;
    const registerFlush = (next: (() => string | null) | null): void => {
      flush = next;
    };
    const onEditorViewReady = (view: EditorView): void => {
      views.push(view);
    };

    await render({
      documentFormat: "mdi",
      initialContent: "{東京|とうきょう}\n",
      isVertical: false,
      lineLength: 40,
      onEditorViewReady,
      registerFlush,
    });
    await waitFor(() => expect(views).toHaveLength(1));
    const mdiView = views[0];

    const markdownLiteral = "# {東京|とうきょう}\n\n[[pagebreak]]\n\n^12^\n";
    const onExternalContentApplied = vi.fn();
    await render({
      documentFormat: "markdown",
      externalContent: markdownLiteral,
      initialContent: markdownLiteral,
      isVertical: true,
      lineLength: 32,
      onEditorViewReady,
      onExternalContentApplied,
      registerFlush,
    });

    await waitFor(() => expect(views).toHaveLength(2));
    await waitFor(() => expect(onExternalContentApplied).toHaveBeenCalledTimes(1));
    expect(views[1]).not.toBe(mdiView);
    expect(runFlush(flush)).toBe("# {東京|とうきょう}\n\n\\[\\[pagebreak]]\n\n^12^\n");
    expect(views[1].state.doc.textContent).toContain("{東京|とうきょう}");
    expect(views[1].state.doc.textContent).toContain("[[pagebreak]]");
    expect(views[1].state.doc.textContent).toContain("^12^");
  });

  it("keeps MDI 0.4 block nodes semantic across writing mode and external replacement", async () => {
    await getDocumentAdapter("mdi").initialize();
    const views: EditorView[] = [];
    let flush: (() => string | null) | null = null;
    const initial = [
      "[[indent:2]]",
      "字下げ本文",
      "",
      "[[blank]]",
      "",
      "[[pagebreak:right]]",
      "",
      "次頁",
      "",
    ].join("\n");
    const baseProps: RuntimeProps = {
      documentFormat: "mdi",
      initialContent: initial,
      isVertical: false,
      lineLength: 40,
      onEditorViewReady: (view) => views.push(view),
      registerFlush: (next) => {
        flush = next;
      },
    };

    await render(baseProps);
    await waitFor(() => expect(views).toHaveLength(1));
    expect(container.querySelector('p.mdi-indent[data-mdi-indent="2"]')).not.toBeNull();
    expect(container.querySelector("div.mdi-blank[data-mdi-blank]")).not.toBeNull();
    expect(container.querySelector('hr.mdi-pagebreak[data-mdi-variant="right"]')).not.toBeNull();
    expect(runFlush(flush)).toContain("[[indent:2]]");
    expect(runFlush(flush)).toContain("[[pagebreak:right]]");

    await render({ ...baseProps, isVertical: true, lineLength: 30 });
    await waitFor(() => {
      const pluginRoot = container.querySelector(".milkdown-vertical-writing") as HTMLElement;
      expect(pluginRoot.dataset.writingMode).toBe("vertical-rl");
    });
    expect(views).toHaveLength(1);
    expect(container.querySelector('p.mdi-indent[data-mdi-indent="2"]')).not.toBeNull();

    const replacement = "[[bottom:3]]\n地付き本文\n\n[[pagebreak:left]]\n";
    const onExternalContentApplied = vi.fn();
    await render({
      ...baseProps,
      externalContent: replacement,
      isVertical: true,
      lineLength: 30,
      onExternalContentApplied,
    });
    await waitFor(() => expect(onExternalContentApplied).toHaveBeenCalledTimes(1));
    expect(container.querySelector('p.mdi-bottom[data-mdi-bottom="3"]')).not.toBeNull();
    expect(container.querySelector('hr.mdi-pagebreak[data-mdi-variant="left"]')).not.toBeNull();
    expect(runFlush(flush)).toBe(replacement);
  });

  it("renders every Rust-owned text block index through provenance and refreshes decorations", async () => {
    await getDocumentAdapter("mdi").initialize();
    showParagraphNumbers = true;
    const views: EditorView[] = [];
    const initial = [
      "# 重複",
      "",
      "重複",
      "",
      "- 重複",
      "",
      "> 重複",
      "",
      "[[pagebreak]]",
      "",
    ].join("\n");
    const props: RuntimeProps = {
      documentFormat: "mdi",
      initialContent: initial,
      isVertical: false,
      lineLength: 40,
      onEditorViewReady: (view) => views.push(view),
    };

    await render(props);
    await waitFor(() => expect(views).toHaveLength(1));
    await waitFor(() => {
      const labels = [...container.querySelectorAll<HTMLElement>(".mdi-block-number")];
      expect(labels.map((label) => label.dataset.mdiBlockIndex)).toEqual(["1", "2", "3", "4"]);
      expect(labels.map((label) => label.dataset.mdiBlockKind)).toEqual([
        "heading",
        "paragraph",
        "listItem",
        "blockquote",
      ]);
    });

    const replacement = "# 新見出し\n\n新本文。\n\n[[pagebreak:right]]\n";
    const onExternalContentApplied = vi.fn();
    await render({ ...props, externalContent: replacement, onExternalContentApplied });
    await waitFor(() => expect(onExternalContentApplied).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const labels = [...container.querySelectorAll<HTMLElement>(".mdi-block-number")];
      expect(labels.map((label) => label.dataset.mdiBlockIndex)).toEqual(["1", "2"]);
      expect(labels.map((label) => label.dataset.mdiBlockKind)).toEqual(["heading", "paragraph"]);
    });

    await render({ ...props, externalContent: null, isVertical: true });
    await waitFor(() =>
      expect(
        [...container.querySelectorAll<HTMLElement>(".mdi-block-number")].map(
          (label) => label.dataset.mdiBlockIndex,
        ),
      ).toEqual(["1", "2"]),
    );

    showParagraphNumbers = false;
    await render({ ...props, externalContent: null, isVertical: true });
    await waitFor(() => expect(container.querySelectorAll(".mdi-block-number")).toHaveLength(0));
  });

  it("destroys and remounts a fresh real editor view", async () => {
    const views: EditorView[] = [];
    const props: RuntimeProps = {
      documentFormat: "plain-text",
      initialContent: "本文",
      isVertical: false,
      lineLength: null,
      onEditorViewReady: (view) => views.push(view),
    };

    await render(props);
    await waitFor(() => expect(views).toHaveLength(1));
    const first = views[0];

    await act(async () => root.render(<></>));
    expect(first.isDestroyed).toBe(true);

    await render(props);
    await waitFor(() => expect(views).toHaveLength(2));
    expect(views[1]).not.toBe(first);
    expect(views[1].state.doc.textContent).toBe("本文");
  });
});
