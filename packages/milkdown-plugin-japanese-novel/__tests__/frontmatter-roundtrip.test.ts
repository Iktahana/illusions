import { afterEach, describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx, serializerCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import type { EditorView } from "@milkdown/prose/view";
import { parse, renderTextFormatWithDiagnostics } from "@illusions-lab/mdi";

import { japaneseNovel } from "../index";

const source = `---
mdi: "2.0"
title: MDI Kitchen Sink
author: illusions-lab
lang: ja
writing-mode: horizontal
---

# 序

本文。`;

const mountedRoots: HTMLElement[] = [];
const editors: Editor[] = [];

afterEach(async () => {
  await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
  mountedRoots.splice(0).forEach((root) => root.remove());
});

async function roundTrip(markdown: string): Promise<{ output: string; view: EditorView }> {
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
        enableFrontmatter: true,
      }),
    )
    .create();
  editors.push(editor);

  let output = "";
  let view!: EditorView;
  editor.action((ctx) => {
    view = ctx.get(editorViewCtx);
    output = ctx.get(serializerCtx)(view.state.doc);
  });
  return { output, view };
}

describe("MDI YAML front matter round-trip", () => {
  it("keeps the YAML node in ProseMirror and serializes its delimiter at byte zero", async () => {
    const { output, view } = await roundTrip(source);

    expect(view.state.doc.firstChild?.type.name).toBe("yaml");
    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain('mdi: "2.0"\ntitle: MDI Kitchen Sink');
    expect(parse(output).document.frontmatter?.entries).toEqual(
      expect.arrayContaining([
        { key: "mdi", value: "2.0" },
        { key: "title", value: "MDI Kitchen Sink" },
        { key: "author", value: "illusions-lab" },
      ]),
    );
  });

  it("does not leak front matter into any publication text flavor after editor serialization", async () => {
    const { output } = await roundTrip(source);

    for (const format of ["txt", "txt-ruby", "narou", "kakuyomu", "aozora"] as const) {
      const rendered = renderTextFormatWithDiagnostics(output, format);
      expect(rendered.diagnostics).toEqual([]);
      expect(rendered.output).not.toContain('mdi: "2.0"');
      expect(rendered.output).not.toContain("title: MDI Kitchen Sink");
      expect(rendered.output).toContain("本文。");
    }
  });
});
