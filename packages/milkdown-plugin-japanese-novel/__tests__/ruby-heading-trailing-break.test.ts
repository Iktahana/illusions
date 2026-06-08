/**
 * Regression test for the "undeletable empty line below a ruby heading" bug.
 *
 * Root cause: `ruby` is an inline atom node. When it is the last inline node of a
 * block (e.g. a heading made entirely of ruby), ProseMirror appends
 * `<img class="ProseMirror-separator"><br class="ProseMirror-trailingBreak">` so
 * the caret can be placed after the atom. The default stylesheet renders that
 * trailing `<br>` as a visible line break, producing a phantom empty line under
 * the heading that the user cannot delete (it is not a real paragraph node).
 *
 * Fix (styles/index.css): hide the trailing `<br>` that directly follows a
 * separator `<img>`. This test verifies the DOM shape the CSS relies on and that
 * the selector targets only the atom case — never a genuine empty paragraph.
 */
import { describe, it, expect } from "vitest";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import type { Node } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import { japaneseNovel } from "../index";

const SELECTOR = "img.ProseMirror-separator + br.ProseMirror-trailingBreak";

async function makeView(markdown: string): Promise<{ editor: Editor; view: EditorView }> {
  const root = document.createElement("div");
  document.body.appendChild(root);
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

function blockTypes(doc: Node): string[] {
  const types: string[] = [];
  doc.forEach((node) => types.push(node.type.name));
  return types;
}

describe("ruby heading trailing break", () => {
  it("does NOT introduce an empty paragraph node for a ruby-only heading", async () => {
    const { editor, view } = await makeView("# {花|か}{様|よう}{年|ねん}{華|か}\n\n本文。");
    const types = blockTypes(view.state.doc);
    await editor.destroy();
    // heading directly followed by the body paragraph — no phantom empty block.
    expect(types).toEqual(["heading", "paragraph"]);
  });

  it("renders a separator + trailing break inside the ruby heading", async () => {
    const { editor, view } = await makeView("# {花|か}{様|よう}{年|ねん}{華|か}\n\n本文。");
    const h1 = view.dom.querySelector("h1")!;
    const targeted = h1.querySelector(SELECTOR);
    await editor.destroy();
    // The CSS fix targets exactly this element; it must exist so the rule applies.
    expect(targeted).not.toBeNull();
  });

  it("plain heading has no trailing break to hide", async () => {
    const { editor, view } = await makeView("# 普通の見出し\n\n本文。");
    const h1 = view.dom.querySelector("h1")!;
    const targeted = h1.querySelector(SELECTOR);
    await editor.destroy();
    expect(targeted).toBeNull();
  });

  it("genuine empty paragraph trailing break is NOT matched by the selector", async () => {
    const { editor, view } = await makeView("# 見出し\n\n本文。");
    // Insert an empty paragraph after the heading (transient just-pressed-Enter state).
    const afterHeading = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.insert(afterHeading, view.state.schema.nodes.paragraph!.create()));

    const emptyParagraphEl = view.dom.querySelectorAll("p")[0]!;
    const matchedInEmpty = emptyParagraphEl.querySelector(SELECTOR);
    const hasOwnBreak = emptyParagraphEl.querySelector("br.ProseMirror-trailingBreak");
    await editor.destroy();

    // The empty paragraph keeps its trailing break (needed for caret height) but
    // it is NOT preceded by a separator, so the fix leaves it visible.
    expect(hasOwnBreak).not.toBeNull();
    expect(matchedInEmpty).toBeNull();
  });
});
