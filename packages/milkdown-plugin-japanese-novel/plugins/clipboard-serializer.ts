import { serializerCtx, schemaCtx } from "@milkdown/core";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Fragment } from "@milkdown/prose/model";
import type { Ctx } from "@milkdown/ctx";
import type { Node as ProseNode, Schema } from "@milkdown/prose/model";
import { MdiDocument, codePlaceholder } from "../mdi-document";
import type { MdiFeatureFlags } from "../mdi-document";

/** ProseMirror node type name for fenced/indented code blocks (commonmark). */
const CODE_BLOCK_NODE = "code_block";
/** ProseMirror inline mark name for `` `code` `` spans (commonmark). */
const INLINE_CODE_MARK = "inlineCode";

/**
 * Options controlling which MDI features are active in the current editor
 * session. These mirror the per-feature flags passed to `japaneseNovel(options)`
 * so the clipboard serializer can gate each MDI macro family independently:
 * a session that enables ONLY ruby must still copy literal `^2024^` and
 * `[[br]]` verbatim.
 */
export interface ClipboardSerializerOptions {
  /** Per-feature MDI macro flags, forwarded to `toClipboardText`. */
  features: MdiFeatureFlags;
}

/**
 * Whether any MDI macro family is enabled. When none are, the serialized text
 * is treated as `.md` / `.txt` content (macros are literal, no bracket-macro
 * recovery on the editor output).
 */
function anyMdiFeatureEnabled(features: MdiFeatureFlags): boolean {
  return (
    features.enableRuby ||
    features.enableTcy ||
    features.enableNoBreak ||
    features.enableKern ||
    features.enableMdiBreak
  );
}

/**
 * Replace every code region in `doc` with a regex-inert placeholder so the
 * MDI/markdown rewriting pipeline never touches code content:
 *
 * - `code_block` nodes are swapped for a paragraph whose only child is a
 *   placeholder text node (keeps the block on its own line, separated by blank
 *   lines, but drops the ``` fences so the restored text is verbatim).
 * - text carrying the `inlineCode` mark is swapped for a placeholder text node
 *   WITHOUT the mark (drops the surrounding backticks).
 *
 * Captured verbatim code text is returned in `segments`, indexed by the number
 * embedded in each placeholder; `MdiDocument.toClipboardText` restores them
 * after the pipeline runs.
 */
function extractCodeSegments(
  doc: ProseNode,
  schema: Schema,
): { doc: ProseNode; segments: string[] } {
  const segments: string[] = [];
  const codeBlockType = schema.nodes[CODE_BLOCK_NODE];
  const paragraphType = schema.nodes.paragraph;
  const inlineCodeMark = schema.marks[INLINE_CODE_MARK];

  const placeholderTextNode = (text: string): ProseNode => {
    const index = segments.length;
    segments.push(text);
    return schema.text(codePlaceholder(index));
  };

  const mapInline = (fragment: Fragment): Fragment => {
    const out: ProseNode[] = [];
    fragment.forEach((child) => {
      if (inlineCodeMark && child.isText && child.marks.some((m) => m.type === inlineCodeMark)) {
        out.push(placeholderTextNode(child.text ?? ""));
        return;
      }
      out.push(child);
    });
    return Fragment.fromArray(out);
  };

  const mapNode = (node: ProseNode): ProseNode => {
    if (codeBlockType && node.type === codeBlockType) {
      const placeholder = placeholderTextNode(node.textContent);
      // Wrap in a paragraph when available so block separation is preserved;
      // fall back to a bare text node otherwise.
      return paragraphType ? paragraphType.create(null, placeholder) : placeholder;
    }
    if (node.isText) return node;
    if (node.inlineContent) {
      return node.copy(mapInline(node.content));
    }
    if (node.childCount > 0) {
      const mapped: ProseNode[] = [];
      node.content.forEach((child) => mapped.push(mapNode(child)));
      return node.copy(Fragment.fromArray(mapped));
    }
    return node;
  };

  const mappedChildren: ProseNode[] = [];
  doc.content.forEach((child) => mappedChildren.push(mapNode(child)));
  return { doc: doc.copy(Fragment.fromArray(mappedChildren)), segments };
}

/**
 * Clipboard *text* serializer.
 *
 * Copying from the editor must put **clean plain text** on `text/plain`, not
 * the raw MDI/markdown that the default `@milkdown/plugin-clipboard` emits
 * (e.g. `# {花|か}`, escaped `\[\[blank]]`). We serialize the copied slice to
 * markdown, then run `MdiDocument.toClipboardText` which:
 *
 * - converts each MDI macro family **only when its feature flag is enabled**
 *   (ruby `{親|ルビ}` → `親（ルビ）`, `^2024^` → `2024`, `[[br]]` → newline …);
 *   a disabled family is preserved verbatim;
 * - strips markdown markup (heading `#`, emphasis `*`, …) and resolves
 *   CommonMark backslash-escapes (`\# title` → `# title`).
 *
 * Before serializing, code regions (`code_block` nodes and `inlineCode`-marked
 * text) are replaced with regex-inert placeholders and restored verbatim after
 * the pipeline, so MDI macros and markdown inside code are copied literally.
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
  const { features } = options;

  return new Plugin({
    key: new PluginKey("mdiClipboardSerializer"),
    props: {
      clipboardTextSerializer: (slice) => {
        const serializer = ctx.get(serializerCtx);
        const schema = ctx.get(schemaCtx);
        const rawDoc = schema.topNodeType.createAndFill(undefined, slice.content);
        // Fallback to ProseMirror's bare text if the slice can't form a doc.
        if (!rawDoc) return slice.content.textBetween(0, slice.content.size, "\n\n");

        const { doc, segments } = extractCodeSegments(rawDoc, schema);
        const markdown = serializer(doc);

        // In MDI mode the editor parses `\[\[blank]]` back to `[[blank]]`, so we
        // use `.mdi` normalisation to recover the bracket macros before export.
        // In non-MDI mode (no macro family enabled) that step is skipped.
        const fileType = anyMdiFeatureEnabled(features) ? ".mdi" : undefined;
        return MdiDocument.fromEditorOutput(markdown, { fileType }).toClipboardText({
          features,
          codeSegments: segments,
        });
      },
    },
  });
}
