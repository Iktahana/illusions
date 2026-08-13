import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commandsCtx,
  defaultValueCtx,
  Editor,
  editorStateCtx,
  editorViewCtx,
  rootCtx,
} from "@milkdown/core";
import { history, undoCommand } from "@milkdown/plugin-history";
import { commonmark } from "@milkdown/preset-commonmark";
import { TextSelection } from "@milkdown/prose/state";
import {
  changeLineLength,
  changeWritingMode,
  verticalWriting,
} from "@illusions-lab/milkdown-plugin-vertical-writing";
import { getDocumentAdapter, type DocumentFormat } from "@/lib/document-format";

const editors: Editor[] = [];

afterEach(async () => {
  await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function createEditor(): Promise<{ editor: Editor; root: HTMLDivElement }> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, "最初の段落");
    })
    .use(commonmark)
    .use(history)
    .use(verticalWriting({ mode: "horizontal-tb", lineLength: 40 }))
    .create();
  editors.push(editor);
  return { editor, root: root.querySelector(".milkdown") ?? root };
}

async function createFormatEditor(format: DocumentFormat, source: string): Promise<Editor> {
  const adapter = getDocumentAdapter(format);
  await adapter.initialize();
  const mount = document.createElement("div");
  document.body.appendChild(mount);

  let builder = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, mount);
      ctx.set(defaultValueCtx, source);
    })
    .use(commonmark);
  builder = adapter.configureEditor(builder);
  const editor = await builder.use(verticalWriting({ mode: "horizontal-tb" })).create();
  editors.push(editor);
  return editor;
}

describe("vertical-writing app integration", () => {
  it("changes mode and line length without replacing the view, document, selection or history", async () => {
    const { editor, root } = await createEditor();
    const before = editor.ctx.get(editorViewCtx);
    const selection = TextSelection.create(before.state.doc, 2);
    before.dispatch(before.state.tr.setSelection(selection).insertText("追記"));
    const edited = before.state.doc.textContent;
    const selectedAt = before.state.selection.from;

    editor.action(changeWritingMode("vertical-rl"));
    editor.action(changeLineLength(32));

    const after = editor.ctx.get(editorViewCtx);
    expect(after).toBe(before);
    expect(after.state.doc.textContent).toBe(edited);
    expect(after.state.selection.from).toBe(selectedAt);
    expect(root.dataset.writingMode).toBe("vertical-rl");
    expect(root.dataset.lineLength).toBe("32");

    editor.action((ctx) => ctx.get(commandsCtx).call(undoCommand.key));
    expect(after.state.doc.textContent).toBe("最初の段落");
  });

  it("maps a vertical wheel gesture to the vertical-rl reading axis", async () => {
    const { editor, root } = await createEditor();
    Object.defineProperties(root, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 1000 },
    });
    editor.action(changeWritingMode("vertical-rl"));

    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
    root.dispatchEvent(event);

    expect(root.scrollLeft).toBe(-80);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a nested vertical scroller in control while it can still scroll", async () => {
    const { editor, root } = await createEditor();
    Object.defineProperties(root, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 1000 },
    });
    editor.action(changeWritingMode("vertical-rl"));

    const nested = document.createElement("div");
    nested.style.overflowY = "auto";
    Object.defineProperties(nested, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 50 },
    });
    root.appendChild(nested);

    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40 });
    nested.dispatchEvent(event);

    expect(root.scrollLeft).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each<DocumentFormat>(["mdi", "markdown", "plain-text"])(
    "uses the same presentation plugin for %s documents",
    async (format) => {
      const adapter = getDocumentAdapter(format);
      await adapter.initialize();
      const mount = document.createElement("div");
      document.body.appendChild(mount);

      let editorBuilder = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, mount);
          ctx.set(defaultValueCtx, "本文");
        })
        .use(commonmark);
      editorBuilder = adapter.configureEditor(editorBuilder);
      const editor = await editorBuilder
        .use(verticalWriting({ mode: "vertical-rl", lineLength: 28 }))
        .create();
      editors.push(editor);
      const pluginRoot = mount.querySelector(".milkdown-vertical-writing") as HTMLElement | null;

      expect(pluginRoot).not.toBeNull();
      expect(pluginRoot?.dataset.writingMode).toBe("vertical-rl");
      expect(pluginRoot?.dataset.lineLength).toBe("28");
    },
  );

  it.each([
    ["mdi", "{東京|とうきょう}と^12^。\n", "と12。"],
    ["markdown", "# {東京|とうきょう}\n", "{東京|とうきょう}"],
    ["plain-text", "# {東京|とうきょう}\n[[pagebreak]]", "# {東京|とうきょう}[[pagebreak]]"],
  ] as const)(
    "round-trips %s through its explicit document adapter",
    async (format, source, text) => {
      const editor = await createFormatEditor(format, source);
      const adapter = getDocumentAdapter(format);
      const view = editor.ctx.get(editorViewCtx);

      expect(view.state.doc.textContent).toBe(text);

      let encoded = "";
      editor.action((ctx) => {
        encoded = adapter.encodeEditor(ctx, ctx.get(editorViewCtx).state.doc);
      });
      expect(encoded).toBe(source);
    },
  );

  it.each([
    ["plain", "[[pagebreak]]", null],
    ["right", "[[pagebreak:right]]", "right"],
    ["left", "[[pagebreak:left]]", "left"],
  ] as const)("round-trips semantic %s pagebreaks from MDI 0.2", async (_name, source, variant) => {
    const editor = await createFormatEditor("mdi", source);
    const state = editor.ctx.get(editorStateCtx);

    expect(state.doc.toJSON()).toEqual({
      type: "doc",
      content: [{ type: "mdiPagebreak", attrs: { variant } }],
    });
    expect(editor.ctx.get(editorViewCtx).dom.querySelector("hr.mdi-pagebreak")).not.toBeNull();

    let encoded = "";
    editor.action((ctx) => {
      encoded = getDocumentAdapter("mdi").encodeEditor(ctx, ctx.get(editorViewCtx).state.doc);
    });
    expect(encoded.trim()).toBe(source);
  });

  it("maps both blank spellings to the canonical semantic blank node", async () => {
    for (const source of ["[[blank]]", "\\"]) {
      const editor = await createFormatEditor("mdi", source);
      const state = editor.ctx.get(editorStateCtx);

      expect(state.doc.toJSON()).toEqual({
        type: "doc",
        content: [{ type: "mdiBlank" }],
      });
      expect(editor.ctx.get(editorViewCtx).dom.querySelector("div.mdi-blank")).not.toBeNull();

      let encoded = "";
      editor.action((ctx) => {
        encoded = getDocumentAdapter("mdi").encodeEditor(ctx, ctx.get(editorViewCtx).state.doc);
      });
      expect(encoded).toBe("\\\n");
    }
  });

  it.each([
    ["indent", "[[indent:2]]\n本文", { mdiIndent: 2, mdiBottom: null }],
    ["bottom", "[[bottom]]\n本文", { mdiIndent: null, mdiBottom: 0 }],
    ["bottom with offset", "[[bottom:3]]\n本文", { mdiIndent: null, mdiBottom: 3 }],
  ] as const)("round-trips semantic paragraph layout: %s", async (_name, source, attrs) => {
    const editor = await createFormatEditor("mdi", source);
    const state = editor.ctx.get(editorStateCtx);
    const paragraph = state.doc.firstChild;

    expect(paragraph?.type.name).toBe("paragraph");
    expect(paragraph?.attrs).toMatchObject(attrs);
    expect(
      editor.ctx
        .get(editorViewCtx)
        .dom.querySelector(`[data-mdi-${_name.startsWith("indent") ? "indent" : "bottom"}]`),
    ).not.toBeNull();

    let encoded = "";
    editor.action((ctx) => {
      encoded = getDocumentAdapter("mdi").encodeEditor(ctx, ctx.get(editorViewCtx).state.doc);
    });
    expect(encoded.trim()).toBe(source);
  });
});
