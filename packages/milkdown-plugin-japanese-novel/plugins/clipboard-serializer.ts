import { Plugin, PluginKey } from "@milkdown/prose/state";
import { serializerCtx, schemaCtx } from "@milkdown/core";
import type { Ctx } from "@milkdown/ctx";
import { MdiDocument } from "../mdi-document";

/**
 * Options controlling which MDI features are active in the current editor
 * session. These mirror the flags passed to `japaneseNovel(options)` so the
 * clipboard serializer can gate MDI macro conversion to the modes that
 * actually parse those macros (i.e. `.mdi` documents).
 */
export interface ClipboardSerializerOptions {
  /**
   * When true at least one MDI inline feature (ruby / tcy / mdi-break) is
   * active and the editor parses the corresponding macros.  The clipboard
   * serializer will then run the full MDI-aware export pipeline so that
   * `{花|か}` copies as `花（か）`, `^2024^` copies as `2024`, etc.
   *
   * When false (`.md` / `.txt` mode) those macros are literal text and must
   * be preserved verbatim on the clipboard.
   */
  enableMdiMacros: boolean;
}

/**
 * Clipboard *text* serializer.
 *
 * Copying from the editor must put **clean plain text** on `text/plain`, not
 * the raw MDI/markdown that the default `@milkdown/plugin-clipboard` emits
 * (e.g. `# {花|か}`, escaped `\[\[blank]]`). We serialize the copied slice to
 * markdown, then:
 *
 * - In **MDI mode** (`enableMdiMacros: true`): run the MDI export pipeline so
 *   ruby `{親|ルビ}` → `親（ルビ）`, `[[blank]]` / `\[\[blank]]` / `<br>` →
 *   blank lines, heading `#`, emphasis `*` … markdown markup is stripped.
 * - In **non-MDI mode** (`enableMdiMacros: false`): the macros are literal
 *   text and must be preserved verbatim.  Only markdown formatting is stripped
 *   and CommonMark backslash-escapes are resolved (e.g. `\# title` →
 *   `# title`).
 *
 * `text/html` is intentionally left to the default serializer so rich paste
 * into Word/Pages keeps headings, ruby (`<ruby>`), and structure.
 *
 * This plugin is registered as part of `japaneseNovel(...)`, which is `.use()`d
 * before `@milkdown/plugin-clipboard`; ProseMirror's `someProp` walks plugins
 * in order and uses the first non-null `clipboardTextSerializer`, so ours wins.
 */
export function createClipboardSerializerPlugin(
  ctx: Ctx,
  options: ClipboardSerializerOptions,
): Plugin {
  const { enableMdiMacros } = options;

  return new Plugin({
    key: new PluginKey("mdiClipboardSerializer"),
    props: {
      clipboardTextSerializer: (slice) => {
        const serializer = ctx.get(serializerCtx);
        const schema = ctx.get(schemaCtx);
        const doc = schema.topNodeType.createAndFill(undefined, slice.content);
        // Fallback to ProseMirror's bare text if the slice can't form a doc.
        if (!doc) return slice.content.textBetween(0, slice.content.size, "\n\n");
        const markdown = serializer(doc);

        // In MDI mode the editor actually parses `\[\[blank]]` back to
        // `[[blank]]` markers, so we use `.mdi` normalisation to recover them
        // before export.  In non-MDI mode the bracket-macro step is skipped.
        const fileType = enableMdiMacros ? ".mdi" : undefined;
        return MdiDocument.fromEditorOutput(markdown, { fileType }).toClipboardText({
          enableMdiMacros,
        });
      },
    },
  });
}
