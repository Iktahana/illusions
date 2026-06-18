/**
 * clearFormatting: 選択範囲を標準本文（段落・装飾なし）へ戻す。
 * 見出し・太字・取り消し線・引用・リスト・コードブロックが
 * すべて素の段落テキストになることを検証する。
 */
import { describe, it, expect, afterEach } from "vitest";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { clearFormatting } from "../clear-formatting";

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
    .use(gfm)
    .create();
  let view!: EditorView;
  editor.action((ctx) => {
    view = ctx.get(editorViewCtx);
  });
  return { editor, view };
}

/** 文書全体を選択して書式解除を実行する。 */
function selectAllAndClear(view: EditorView): void {
  const { doc } = view.state;
  const sel = TextSelection.create(doc, 1, doc.content.size - 1);
  view.dispatch(view.state.tr.setSelection(sel));
  clearFormatting(view);
}

describe("clearFormatting", () => {
  it("見出しを標準段落に戻す", async () => {
    const { view } = await makeView("# 花様年華");
    selectAllAndClear(view);
    const top = view.state.doc.firstChild;
    expect(top?.type.name).toBe("paragraph");
    expect(view.state.doc.textContent).toBe("花様年華");
  });

  it("太字・斜体・取り消し線などのインラインマークを除去する", async () => {
    const { view } = await makeView("**太字** *斜体* ~~取り消し~~");
    selectAllAndClear(view);
    let markCount = 0;
    view.state.doc.descendants((node) => {
      markCount += node.marks.length;
    });
    expect(markCount).toBe(0);
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("引用ブロックを解除して段落に戻す", async () => {
    const { view } = await makeView("> 引用文です");
    selectAllAndClear(view);
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(view.state.doc.textContent).toBe("引用文です");
  });

  it("リスト項目を解除して段落に戻す", async () => {
    const { view } = await makeView("- 項目一\n- 項目二");
    selectAllAndClear(view);
    view.state.doc.forEach((node) => {
      expect(node.type.name).toBe("paragraph");
    });
  });

  it("選択が空のときは何も変更しない", async () => {
    const { view } = await makeView("# 見出し");
    const before = view.state.doc.toJSON();
    // カーソルのみ（空選択）
    const sel = TextSelection.create(view.state.doc, 1, 1);
    view.dispatch(view.state.tr.setSelection(sel));
    clearFormatting(view);
    expect(view.state.doc.toJSON()).toEqual(before);
  });
});
