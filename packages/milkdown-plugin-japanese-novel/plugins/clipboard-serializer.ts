import { Plugin, PluginKey } from "@milkdown/prose/state";
import { serializerCtx, schemaCtx } from "@milkdown/core";
import type { Ctx } from "@milkdown/ctx";
import { MdiDocument } from "../mdi-document";

/**
 * Clipboard *text* serializer.
 *
 * Copying from the editor must put **clean plain text** on `text/plain`, not the
 * raw MDI/markdown that the default `@milkdown/plugin-clipboard` emits (e.g.
 * `# {花|か}{様|よう}`, escaped `\[\[blank]]`). We serialize the copied slice to
 * markdown, then run it through the MDI export pipeline so that:
 *   - ruby `{親|ルビ}` → `親（ルビ）`
 *   - `[[blank]]` / `\[\[blank]]` / `<br>` → blank lines
 *   - heading `#`, emphasis `*` … markdown markup is stripped
 *
 * `text/html` is intentionally left to the default serializer so rich paste into
 * Word/Pages keeps headings, ruby (`<ruby>`), and structure.
 *
 * This plugin is registered as part of `japaneseNovel(...)`, which is `.use()`d
 * before `@milkdown/plugin-clipboard`; ProseMirror's `someProp` walks plugins in
 * order and uses the first non-null `clipboardTextSerializer`, so ours wins.
 */
export function createClipboardSerializerPlugin(ctx: Ctx): Plugin {
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
        return MdiDocument.fromEditorOutput(markdown, { fileType: ".mdi" }).toExportText("txt-ruby");
      },
    },
  });
}
