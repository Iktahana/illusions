/**
 * Regression test for #1886:
 * [[blank]], [[no-break:...]], [[kern:...:...]] macros must NOT be parsed/stripped
 * when editing .txt or .md files (mdiExtensionsEnabled = false).
 * Only .mdi files (enableMdiBreak = true) should activate MDI parsing.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import type { EditorView } from "@milkdown/prose/view";
import { japaneseNovel } from "../index";
import { remarkMdiBlankPlugin, remarkNoBreakPlugin, remarkKernPlugin } from "../syntax";

// ---------------------------------------------------------------------------
// Pure remark-plugin unit tests (no full editor mount needed)
// ---------------------------------------------------------------------------

type TextNode = { type: "text"; value: string };
type Paragraph = { type: "paragraph"; children: TextNode[] };
type Root = { type: "root"; children: Paragraph[] };

function makeTree(paragraphText: string): Root {
  return {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: paragraphText }] }],
  };
}

function runBlankPlugin(tree: Root, opts?: { enable?: boolean }): Root {
  const factory = remarkMdiBlankPlugin as unknown as (o?: {
    enable?: boolean;
  }) => (t: Root) => void;
  factory(opts)(tree);
  return tree;
}

function runNoBreakPlugin(tree: Root, opts?: { enable?: boolean }): Root {
  const factory = remarkNoBreakPlugin as unknown as (o?: { enable?: boolean }) => (t: Root) => void;
  factory(opts)(tree);
  return tree;
}

function runKernPlugin(tree: Root, opts?: { enable?: boolean }): Root {
  const factory = remarkKernPlugin as unknown as (o?: { enable?: boolean }) => (t: Root) => void;
  factory(opts)(tree);
  return tree;
}

describe("Issue #1886 — remarkMdiBlankPlugin disabled for non-MDI files", () => {
  it("[[blank]] paragraph is NOT converted when enable=false (.txt/.md mode)", () => {
    const tree = runBlankPlugin(makeTree("[[blank]]"), { enable: false });
    // Must remain a plain paragraph — not a blankParagraph node that strips content
    expect(tree.children[0]!.type).toBe("paragraph");
    expect(tree.children[0]!.children).toHaveLength(1);
    expect((tree.children[0]!.children[0] as TextNode).value).toBe("[[blank]]");
  });

  it("[[blank]] paragraph IS converted when enabled (.mdi mode)", () => {
    const tree = runBlankPlugin(makeTree("[[blank]]"), { enable: true });
    const node = tree.children[0]! as unknown as { type: string; children: unknown[] };
    expect(node.type).toBe("blankParagraph");
    expect(node.children).toHaveLength(0);
  });
});

describe("Issue #1886 — remarkNoBreakPlugin disabled for non-MDI files", () => {
  it("[[no-break:ABC]] is preserved verbatim when enable=false (.txt/.md mode)", () => {
    const tree = runNoBreakPlugin(makeTree("前[[no-break:ABC]]後"), { enable: false });
    expect(tree.children[0]!.type).toBe("paragraph");
    expect(tree.children[0]!.children).toHaveLength(1);
    // The full literal text must survive unchanged
    expect((tree.children[0]!.children[0] as TextNode).value).toBe("前[[no-break:ABC]]後");
  });

  it("[[no-break:ABC]] IS parsed when enabled (.mdi mode)", () => {
    const tree = runNoBreakPlugin(makeTree("前[[no-break:ABC]]後"), { enable: true });
    // The text node is split into text + nobreak + text
    expect(tree.children[0]!.children.length).toBeGreaterThan(1);
    const types = tree.children[0]!.children.map((n) => (n as { type: string }).type);
    expect(types).toContain("nobreak");
  });
});

describe("Issue #1886 — remarkKernPlugin disabled for non-MDI files", () => {
  it("[[kern:0.5em:wide]] is preserved verbatim when enable=false (.txt/.md mode)", () => {
    const tree = runKernPlugin(makeTree("前[[kern:0.5em:wide]]後"), { enable: false });
    expect(tree.children[0]!.type).toBe("paragraph");
    expect(tree.children[0]!.children).toHaveLength(1);
    expect((tree.children[0]!.children[0] as TextNode).value).toBe("前[[kern:0.5em:wide]]後");
  });

  it("[[kern:0.5em:wide]] IS parsed when enabled (.mdi mode)", () => {
    const tree = runKernPlugin(makeTree("前[[kern:0.5em:wide]]後"), { enable: true });
    // The text node is split — kern node appears
    expect(tree.children[0]!.children.length).toBeGreaterThan(1);
    const types = tree.children[0]!.children.map((n) => (n as { type: string }).type);
    expect(types).toContain("kern");
  });
});

// ---------------------------------------------------------------------------
// Full editor mount: textContent of parse tree must preserve macros for non-MDI
// ---------------------------------------------------------------------------

const mountedRoots: HTMLElement[] = [];
afterEach(() => {
  mountedRoots.forEach((r) => r.remove());
  mountedRoots.length = 0;
});

/**
 * Mounts an editor with MDI disabled (mirrors .txt / .md mode) and returns the
 * textContent of every top-level node (reflecting what the change listener would
 * emit for `tab.content` via the `updated` path in plain-text mode, or the
 * clipboard serializer fallback).
 */
async function collectTextNonMdi(source: string): Promise<string> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  mountedRoots.push(root);

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, source);
    })
    .use(commonmark)
    .use(
      japaneseNovel({
        isVertical: false,
        showManuscriptLine: false,
        enableRuby: false,
        enableTcy: false,
        enableNoBreak: false,
        enableKern: false,
        enableMdiBreak: false,
        plainText: false,
      }),
    )
    .create();

  let collectedText = "";
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const lines: string[] = [];
    view.state.doc.forEach((node) => {
      lines.push(node.textContent);
    });
    collectedText = lines.join("\n");
  });

  await editor.destroy();
  return collectedText;
}

/**
 * Mounts an editor with MDI enabled (mirrors .mdi mode) and returns the
 * textContent of every top-level node.
 */
async function collectTextMdi(source: string): Promise<string> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  mountedRoots.push(root);

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, source);
    })
    .use(commonmark)
    .use(
      japaneseNovel({
        isVertical: false,
        showManuscriptLine: false,
        enableRuby: true,
        enableTcy: true,
        enableNoBreak: true,
        enableKern: true,
        enableMdiBreak: true,
        plainText: false,
      }),
    )
    .create();

  let collectedText = "";
  editor.action((ctx) => {
    const view: EditorView = ctx.get(editorViewCtx);
    const lines: string[] = [];
    view.state.doc.forEach((node) => {
      lines.push(node.textContent);
    });
    collectedText = lines.join("\n");
  });

  await editor.destroy();
  return collectedText;
}

describe("Issue #1886 — full editor: MDI macros preserved as text in non-MDI mode", () => {
  it("[[blank]] paragraph text is preserved in non-MDI mode (not silently removed)", async () => {
    // Without the fix, [[blank]] is parsed as a blankParagraph node whose textContent
    // is empty, so tab.content loses the marker on every save.
    const text = await collectTextNonMdi("段落A\n\n[[blank]]\n\n段落B");
    expect(text).toContain("[[blank]]");
    expect(text).toContain("段落A");
    expect(text).toContain("段落B");
  });

  it("[[no-break:ABC]] text survives in non-MDI mode (not stripped to ABC)", async () => {
    // Without the fix, [[no-break:ABC]] is parsed as a nobreak node whose textContent
    // is "ABC", dropping the macro wrapper on save.
    const text = await collectTextNonMdi("前[[no-break:ABC]]後");
    expect(text).toContain("[[no-break:ABC]]");
    expect(text).not.toMatch(/^前ABC後$/m);
  });

  it("[[kern:0.5em:wide]] text survives in non-MDI mode (not stripped to wide)", async () => {
    // Without the fix, [[kern:0.5em:wide]] is parsed as a kern node whose textContent
    // is "wide", dropping the macro wrapper on save.
    const text = await collectTextNonMdi("前[[kern:0.5em:wide]]後");
    expect(text).toContain("[[kern:0.5em:wide]]");
    expect(text).not.toMatch(/^前wide後$/m);
  });

  it("[[blank]] IS parsed as an empty node in .mdi mode (feature still works)", async () => {
    // The .mdi path must not regress: blankParagraph node has no textContent.
    const text = await collectTextMdi("段落A\n\n[[blank]]\n\n段落B");
    // In MDI mode [[blank]] becomes an empty paragraph — no literal marker in text output.
    expect(text).not.toContain("[[blank]]");
    expect(text).toContain("段落A");
    expect(text).toContain("段落B");
  });

  it("[[no-break:ABC]] IS converted to a nobreak atom in .mdi mode (macro syntax gone)", async () => {
    const text = await collectTextMdi("前[[no-break:ABC]]後");
    // The nobreak node is an atom (attrs-only, no textContent children).
    // The macro syntax must be gone — only the surrounding text survives as textContent.
    expect(text).not.toContain("[[no-break:");
    // textContent of atom nodes is empty; surrounding text still present.
    expect(text).toContain("前");
    expect(text).toContain("後");
  });
});
