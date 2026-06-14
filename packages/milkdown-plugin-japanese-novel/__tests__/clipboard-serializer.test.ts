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

/** MDI mode: ruby/tcy/mdi-break all enabled (.mdi documents). */
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

/**
 * Non-MDI mode: all MDI macro features disabled (.md / .txt documents).
 * Literal `{花|か}`, `^2024^`, `[[br]]` must survive verbatim on the clipboard.
 */
async function makeViewNonMdi(markdown: string): Promise<{ editor: Editor; view: EditorView }> {
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
        enableRuby: false,
        enableTcy: false,
        enableMdiBreak: false,
      }),
    )
    .create();
  let view!: EditorView;
  editor.action((ctx) => {
    view = ctx.get(editorViewCtx);
  });
  return { editor, view };
}

/**
 * Only-ruby mode: ruby enabled, every other macro family disabled. Ruby still
 * converts, but literal `^2024^` / `[[br]]` must be copied verbatim (P2-A).
 */
async function makeViewRubyOnly(markdown: string): Promise<{ editor: Editor; view: EditorView }> {
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
        enableTcy: false,
        enableNoBreak: false,
        enableKern: false,
        enableMdiBreak: false,
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

describe("clipboard text serializer — P2-1: mode blindness (non-MDI mode)", () => {
  it("literal ruby {花|か} is copied verbatim in non-MDI mode", async () => {
    const { editor, view } = await makeViewNonMdi("本文に{花|か}と書いた。");
    const text = copyAll(view);
    await editor.destroy();
    // In .md/.txt mode the brace-pipe syntax is literal text, NOT ruby — must not convert.
    expect(text).toContain("{花|か}");
    expect(text).not.toContain("花（か）");
  });

  it("literal TCY ^2024^ is copied verbatim in non-MDI mode", async () => {
    const { editor, view } = await makeViewNonMdi("西暦^2024^年の出来事。");
    const text = copyAll(view);
    await editor.destroy();
    expect(text).toContain("^2024^");
  });

  it("literal [[br]] is copied verbatim in non-MDI mode", async () => {
    const { editor, view } = await makeViewNonMdi("行A[[br]]行B");
    const text = copyAll(view);
    await editor.destroy();
    expect(text).toContain("[[br]]");
    // Must NOT be converted to a newline (which would make the marker disappear)
    expect(text).not.toMatch(/行A\n行B/);
  });

  it("fenced code block content is copied verbatim in non-MDI mode", async () => {
    const { editor, view } = await makeViewNonMdi(
      "説明文\n\n```\n{花|か} ^2024^ [[br]]\n```\n\n後続テキスト",
    );
    const text = copyAll(view);
    await editor.destroy();
    // Code block content must not be MDI-transformed
    expect(text).toContain("{花|か}");
    expect(text).toContain("^2024^");
    expect(text).toContain("[[br]]");
    expect(text).not.toContain("花（か）");
  });
});

describe("clipboard text serializer — P2-A: per-feature gating (only ruby enabled)", () => {
  it("ruby converts but literal ^2024^ / [[br]] are copied verbatim", async () => {
    const { editor, view } = await makeViewRubyOnly("{花|か}は西暦^2024^年[[br]]に咲く。");
    const text = copyAll(view);
    await editor.destroy();
    // Ruby feature is ON → converts.
    expect(text).toContain("花（か）");
    // TCY / mdi-break features are OFF → literal text must survive verbatim.
    expect(text).toContain("^2024^");
    expect(text).toContain("[[br]]");
    expect(text).not.toMatch(/年\nに/); // [[br]] not turned into a newline
  });
});

describe("clipboard text serializer — P2-B: code context", () => {
  it("fenced code block content is copied literally even in MDI mode", async () => {
    const { editor, view } = await makeView(
      "説明文\n\n```\n{花|か} ^2024^ [[br]]\n```\n\n後続テキスト",
    );
    const text = copyAll(view);
    await editor.destroy();
    // Code content must bypass MDI/markdown transformation entirely.
    expect(text).toContain("{花|か}");
    expect(text).toContain("^2024^");
    expect(text).toContain("[[br]]");
    expect(text).not.toContain("花（か）");
    // Surrounding prose still copies as plain text.
    expect(text).toContain("説明文");
    expect(text).toContain("後続テキスト");
  });

  it("inline code span content is copied literally even in MDI mode", async () => {
    const { editor, view } = await makeView("コードは `{花|か} ^2024^ [[br]]` と書く。");
    const text = copyAll(view);
    await editor.destroy();
    expect(text).toContain("{花|か}");
    expect(text).toContain("^2024^");
    expect(text).toContain("[[br]]");
    expect(text).not.toContain("花（か）");
    // The non-code prose around the span survives.
    expect(text).toContain("コードは");
    expect(text).toContain("と書く。");
  });
});

describe("clipboard text serializer — P2-2: CommonMark escape leak", () => {
  it("escaped markdown punctuation \\# copies without the backslash", async () => {
    // \# in CommonMark means a literal `#` character (not a heading).
    // The Milkdown serializer emits `\# title` for a paragraph starting with `# title`.
    // After stripping, the user should get `# title` on the clipboard, not `\# title`.
    const { editor, view } = await makeView("\\# タイトル行\n\n本文。");
    const text = copyAll(view);
    await editor.destroy();
    expect(text).not.toContain("\\#");
    expect(text).toContain("# タイトル行");
  });

  it("escaped backslash \\\\ copies as single backslash", async () => {
    // CommonMark: \\ → literal backslash.
    // Milkdown serializer emits \\ for a paragraph containing a single `\`.
    // Our unescaper must reduce \\ → \ so the user gets one backslash, not two.
    const { editor, view } = await makeView("パス: C:\\\\Users\\\\name");
    const text = copyAll(view);
    await editor.destroy();
    // The double backslash must be collapsed to single
    expect(text).not.toContain("\\\\");
    expect(text).toContain("C:\\Users\\name");
  });

  it("escaped backslash in non-MDI mode also resolves correctly", async () => {
    const { editor, view } = await makeViewNonMdi("パス: C:\\\\Users\\\\name");
    const text = copyAll(view);
    await editor.destroy();
    expect(text).not.toContain("\\\\");
    expect(text).toContain("C:\\Users\\name");
  });
});
