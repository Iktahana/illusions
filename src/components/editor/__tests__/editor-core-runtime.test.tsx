import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EditorView } from "@milkdown/prose/view";

import Editor from "@/components/Editor";
import { getDocumentAdapter, type DocumentFormat } from "@/lib/document-format";

vi.mock("@/contexts/EditorSettingsContext", () => ({
  useTypographySettings: () => ({
    fontScale: 100,
    lineHeight: 1.8,
    paragraphSpacing: 0.5,
    textIndent: 1,
    fontFamily: "serif",
    charsPerLine: 40,
  }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeAll(async () => {
  await getDocumentAdapter("mdi").initialize();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function mountEditor(format: DocumentFormat, source: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let view: EditorView | null = null;
  let flush: (() => string | null) | null = null;
  const changes: string[] = [];

  await act(async () => {
    root?.render(
      <Editor
        initialContent={source}
        documentFormat={format}
        onChange={(content) => changes.push(content)}
        onEditorViewReady={(nextView) => {
          view = nextView;
        }}
        registerFlush={(nextFlush) => {
          flush = nextFlush;
        }}
      />,
    );
  });

  await vi.waitFor(() => expect(view).not.toBeNull());
  await vi.waitFor(() => expect(flush).not.toBeNull());
  return {
    get view(): EditorView {
      if (!view) throw new Error("editor view is not ready");
      return view;
    },
    get flush(): () => string | null {
      if (!flush) throw new Error("flush callback is not ready");
      return flush;
    },
    changes,
  };
}

describe("package-first editor runtime", () => {
  it("mounts the real MDI and vertical-writing plugins and flushes canonical MDI", async () => {
    const source = "{東京|とうきょう}と^12^。\n";
    const editor = await mountEditor("mdi", source);

    expect(container?.querySelector(".milkdown-vertical-writing")).not.toBeNull();
    expect(container?.querySelector("ruby.mdi-ruby")).not.toBeNull();
    expect(container?.querySelector(".mdi-tcy")?.textContent).toBe("12");
    expect(editor.flush()).toBe(source);

    act(() => {
      const position = editor.view.state.doc.content.size;
      editor.view.dispatch(editor.view.state.tr.insertText("追記", position));
    });
    await vi.waitFor(() => expect(editor.changes.at(-1)).toContain("追記"));
    expect(editor.flush()).toContain("追記");
  });

  it.each([
    ["markdown", "# {東京|とうきょう}\n", "{東京|とうきょう}"],
    ["plain-text", "# {東京|とうきょう}\n[[blank]]", "# {東京|とうきょう}[[blank]]"],
  ] as const)("keeps MDI-looking syntax literal in %s", async (format, source, visibleText) => {
    const editor = await mountEditor(format, source);

    expect(editor.view.state.doc.textContent).toBe(visibleText);
    expect(container?.querySelector("ruby.mdi-ruby")).toBeNull();
    expect(editor.flush()).toBe(source);
  });
});
