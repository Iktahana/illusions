import { describe, it, expect, afterEach } from "vitest";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { $remark } from "@milkdown/utils";
import type { EditorView } from "@milkdown/prose/view";
import { japaneseNovel } from "../index";
import { remarkPlainTextPlugin } from "../syntax/remark-plain-text";

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
      }),
    )
    .create();

  let view!: EditorView;
  editor.action((ctx) => {
    view = ctx.get(editorViewCtx);
  });

  return { editor, view };
}

async function makePlainTextView(source: string): Promise<{ editor: Editor; view: EditorView }> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  mountedRoots.push(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, source);
    })
    .use(commonmark)
    .use($remark("plainText", () => remarkPlainTextPlugin))
    .use(
      japaneseNovel({
        isVertical: false,
        showManuscriptLine: false,
        enableRuby: false,
        enableTcy: false,
        enableNoBreak: false,
        enableKern: false,
        enableMdiBreak: false,
        plainText: true,
      }),
    )
    .create();

  let view!: EditorView;
  editor.action((ctx) => {
    view = ctx.get(editorViewCtx);
  });

  return { editor, view };
}

function firstBlockType(view: EditorView): string {
  return view.state.doc.firstChild?.type.name ?? "";
}

describe("full-width markdown compatibility", () => {
  it("treats full-width heading marker as heading", async () => {
    const { editor, view } = await makeView("＃ 見出し\n\n本文");
    expect(firstBlockType(view)).toBe("heading");
    await editor.destroy();
  });

  it("treats full-width blockquote marker as blockquote", async () => {
    const { editor, view } = await makeView("＞ 引用文");
    expect(firstBlockType(view)).toBe("blockquote");
    await editor.destroy();
  });

  it("treats full-width bullet marker as bullet list", async () => {
    const { editor, view } = await makeView("＊ 箇条書き");
    expect(firstBlockType(view)).toBe("bullet_list");
    await editor.destroy();
  });

  it("treats full-width ordered list marker as ordered list", async () => {
    const { editor, view } = await makeView("１． 項目");
    expect(firstBlockType(view)).toBe("ordered_list");
    await editor.destroy();
  });

  it("merges consecutive full-width bullet markers into a single list", async () => {
    const { editor, view } = await makeView("＊ 一\n\n＊ 二\n\n＊ 三");
    const doc = view.state.doc;
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild?.type.name).toBe("bullet_list");
    expect(doc.firstChild?.childCount).toBe(3);
    await editor.destroy();
  });

  it("merges consecutive full-width ordered markers into a single list", async () => {
    const { editor, view } = await makeView("１． 一\n\n２． 二");
    const doc = view.state.doc;
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild?.type.name).toBe("ordered_list");
    expect(doc.firstChild?.childCount).toBe(2);
    await editor.destroy();
  });

  it("does not merge full-width bullets separated by a paragraph", async () => {
    const { editor, view } = await makeView("＊ 一\n\n本文\n\n＊ 二");
    const types: string[] = [];
    view.state.doc.forEach((n) => types.push(n.type.name));
    expect(types).toEqual(["bullet_list", "paragraph", "bullet_list"]);
    await editor.destroy();
  });

  it("keeps full-width markers literal in plain-text mode", async () => {
    const { editor, view } = await makePlainTextView("＃ 見出し\n＊ 箇条書き");
    expect(firstBlockType(view)).toBe("paragraph");
    expect(view.state.doc.textContent).toContain("＃ 見出し");
    expect(view.state.doc.textContent).toContain("＊ 箇条書き");
    await editor.destroy();
  });
});
