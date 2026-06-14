/**
 * Bug D: copying from the editor must produce clean plain text on text/plain,
 * not raw MDI markup (# {花|か}, \[\[blank]], etc).
 */
import { describe, it, expect, afterEach } from "vitest";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { clipboard } from "@milkdown/plugin-clipboard";
import type { EditorView } from "@milkdown/prose/view";
import { japaneseNovel } from "../index";

const mountedRoots: HTMLElement[] = [];
afterEach(() => {
  mountedRoots.forEach((r) => r.remove());
  mountedRoots.length = 0;
});

async function makeView(markdown: string): Promise<{ editor: Editor; view: EditorView }> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  mountedRoots.push(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(
      japaneseNovel({
        isVertical: false,
        showManuscriptLine: false,
        enableRuby: true,
        enableTcy: true,
        enableMdiBreak: true,
      }),
    )
    .create();
  let view!: EditorView;
  editor.action((ctx) => {
    view = ctx.get(editorViewCtx);
  });
  return { editor, view };
}

// Mirror the real app's plugin order: japaneseNovel(...) is .use()d BEFORE
// @milkdown/plugin-clipboard (MilkdownEditor.tsx). ProseMirror's someProp uses
// the first non-null clipboardTextSerializer, so ours must win.
async function makeViewWithClipboard(
  markdown: string,
): Promise<{ editor: Editor; view: EditorView }> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  mountedRoots.push(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(
      japaneseNovel({
        isVertical: false,
        showManuscriptLine: false,
        enableRuby: true,
        enableTcy: true,
        enableMdiBreak: true,
      }),
    )
    .use(clipboard)
    .create();
  let view!: EditorView;
  editor.action((ctx) => {
    view = ctx.get(editorViewCtx);
  });
  return { editor, view };
}

function copyAll(view: EditorView): string {
  const slice = view.state.doc.slice(0, view.state.doc.content.size);
  const fn = view.someProp("clipboardTextSerializer");
  if (!fn) throw new Error("no clipboardTextSerializer registered");
  return fn(slice, view);
}

describe("clipboard text serializer (Bug D)", () => {
  it("ruby heading becomes clean text with fullwidth-paren ruby, no markup", async () => {
    const { editor, view } = await makeView("# {花|か}{様|よう}{年|ねん}{華|か}\n\n本文テスト。");
    const text = copyAll(view);
    await editor.destroy();
    expect(text).not.toContain("{花|");
    expect(text).not.toContain("|");
    expect(text).not.toMatch(/^#\s/m); // heading marker stripped
    expect(text).toContain("花（か）");
    expect(text).toContain("本文テスト");
  });

  it("[[blank]] markers do not leak (no literal marker, no escaped \\[)", async () => {
    const { editor, view } = await makeView("A段落\n\n[[blank]]\n\nB段落");
    const text = copyAll(view);
    await editor.destroy();
    expect(text).not.toContain("[[blank]]");
    expect(text).not.toContain("\\[");
    expect(text).toContain("A段落");
    expect(text).toContain("B段落");
  });

  it("dialogue paragraphs survive as plain text", async () => {
    const { editor, view } = await makeView("「ほんとに、いたんですか。」\n\n「さあ。」");
    const text = copyAll(view);
    await editor.destroy();
    expect(text).toContain("「ほんとに、いたんですか。」");
    expect(text).toContain("「さあ。」");
  });

  it("wins over @milkdown/plugin-clipboard in real plugin order", async () => {
    const { editor, view } = await makeViewWithClipboard("# {花|か}{様|よう}\n\n本文。");
    const text = copyAll(view);
    await editor.destroy();
    // The default clipboard plugin would emit raw markdown (`# {花|か}`);
    // our serializer must take precedence and produce clean text.
    expect(text).not.toContain("{花|");
    expect(text).not.toMatch(/^#\s/m);
    expect(text).toContain("花（か）");
  });
});
