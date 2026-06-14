import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { Ctx } from "@milkdown/ctx";
import type { Fragment, Node as ProseNode } from "@milkdown/prose/model";
import { replaceMdiWithRubyTextGated } from "../mdi-document";
import type { MdiFeatureFlags } from "../mdi-document";

/**
 * Options controlling which MDI features are active in the current editor
 * session. These mirror the per-feature flags passed to `japaneseNovel(options)`
 * so the clipboard serializer can gate each MDI macro family independently:
 * a session that enables ONLY ruby must still copy literal `^2024^` and
 * `[[br]]` verbatim.
 */
export interface ClipboardSerializerOptions {
  /** Per-feature MDI macro flags governing inline-macro rendering. */
  features: MdiFeatureFlags;
  /**
   * Plain-text (`.txt`) mode. When `true`, the editor installs
   * `remarkPlainTextPlugin` (see `MilkdownEditor.tsx`) so `*`, `#`, `**` are
   * LITERAL characters, not markdown. The clipboard serializer must then copy
   * the selection's text verbatim — every character is already literal in the
   * ProseMirror text nodes, so the AST walk needs no special casing beyond
   * joining blocks with newlines. Defaults to `false` for `.md` / `.mdi`.
   */
  plainText?: boolean;
}

// ---------------------------------------------------------------------------
// ProseMirror schema type names (commonmark preset + MDI nodes)
// ---------------------------------------------------------------------------

/**
 * Fenced/indented code block: content is copied verbatim, never MDI-converted.
 *
 * Inline `` `code` `` spans need no special case: they are plain text carrying
 * the `inlineCode` mark, and the walk emits `node.text` verbatim — the mark
 * (like em/strong/link) carries no markup text, so backticks never appear and
 * MDI conversion never runs on text inside an inline-code span.
 */
const CODE_BLOCK_NODE = "code_block";
/** CommonMark hard line break (Shift+Enter / trailing two spaces) → newline. */
const HARDBREAK_NODE = "hardbreak";
/** MDI explicit line break `[[br]]`. */
const MDI_BREAK_NODE = "mdibreak";
/** MDI forced empty paragraph `[[blank]]`. */
const BLANK_PARAGRAPH_NODE = "blankParagraph";
/** Ruby annotation node: attrs `base` / `text`. */
const RUBY_NODE = "ruby";
/** Tate-chu-yoko node: attr `value`. */
const TCY_NODE = "tcy";
/** No-break span node: attr `text`. */
const NOBREAK_NODE = "nobreak";
/** Kerning span node: attrs `amount` / `text`. */
const KERN_NODE = "kern";

/** Block container nodes whose children are themselves block-level. */
const LIST_CONTAINER_NODES = new Set(["bullet_list", "ordered_list"]);
const LIST_ITEM_NODE = "list_item";
const BLOCKQUOTE_NODE = "blockquote";

/**
 * Render the literal `.mdi` source string that an MDI inline node round-trips
 * to (matching each node's `toMarkdown` runner). Used when the node's feature
 * flag is OFF so the macro is copied verbatim.
 */
function mdiNodeLiteral(node: ProseNode): string {
  switch (node.type.name) {
    case RUBY_NODE:
      return `{${node.attrs.base as string}|${node.attrs.text as string}}`;
    case TCY_NODE:
      return `^${node.attrs.value as string}^`;
    case NOBREAK_NODE:
      return `[[no-break:${node.attrs.text as string}]]`;
    case KERN_NODE:
      return `[[kern:${node.attrs.amount as string}:${node.attrs.text as string}]]`;
    case MDI_BREAK_NODE:
      return "[[br]]";
    default:
      return "";
  }
}

/**
 * Render a single inline node to clipboard text.
 *
 * - Text nodes (incl. inline-code-marked text) emit `node.text` VERBATIM. The
 *   text is already literal in the ProseMirror model — there is no markdown
 *   escaping to undo and no emphasis/link markup to strip (marks carry no text).
 * - MDI macro nodes render per their feature flag: enabled → converted
 *   (ruby `base（text）`, tcy/no-break/kern → inner text, `[[br]]` → newline);
 *   disabled → the literal `.mdi` source verbatim.
 * - `hardbreak` → newline.
 */
function inlineNodeToText(node: ProseNode, features: MdiFeatureFlags): string {
  if (node.isText) return node.text ?? "";

  switch (node.type.name) {
    case RUBY_NODE:
      // Reuse the shared ruby renderer so split-ruby dot handling stays in one place.
      return features.enableRuby
        ? replaceMdiWithRubyTextGated(mdiNodeLiteral(node), features)
        : mdiNodeLiteral(node);
    case TCY_NODE:
      return features.enableTcy ? (node.attrs.value as string) : mdiNodeLiteral(node);
    case NOBREAK_NODE:
      return features.enableNoBreak ? (node.attrs.text as string) : mdiNodeLiteral(node);
    case KERN_NODE:
      return features.enableKern ? (node.attrs.text as string) : mdiNodeLiteral(node);
    case MDI_BREAK_NODE:
      return features.enableMdiBreak ? "\n" : mdiNodeLiteral(node);
    case HARDBREAK_NODE:
      return "\n";
    default:
      // Any other inline leaf (e.g. image) contributes only its text content.
      return node.textContent;
  }
}

/** Concatenate the inline children of a block node into a single text line. */
function inlineFragmentToText(fragment: Fragment, features: MdiFeatureFlags): string {
  let out = "";
  fragment.forEach((child) => {
    out += inlineNodeToText(child, features);
  });
  return out;
}

/**
 * Walk a block-level fragment, producing an array of block text segments.
 * Each entry is one logical block (paragraph, heading, list item, code block);
 * the caller joins them with a single blank line so author-intended paragraph
 * separation is preserved without spurious markdown blank-line artifacts.
 *
 * A `blankParagraph` ([[blank]]) yields an empty segment, which the blank-line
 * join renders as an intentional extra blank line between its neighbours.
 */
function blocksToSegments(fragment: Fragment, features: MdiFeatureFlags): string[] {
  const segments: string[] = [];

  fragment.forEach((node) => {
    const name = node.type.name;

    if (name === CODE_BLOCK_NODE) {
      // Code content is literal: never MDI-converted, never markdown-stripped.
      segments.push(node.textContent);
      return;
    }

    if (name === BLANK_PARAGRAPH_NODE) {
      // Empty [[blank]] → intentional blank line; non-empty behaves like a paragraph.
      segments.push(node.content.size === 0 ? "" : inlineFragmentToText(node.content, features));
      return;
    }

    if (LIST_CONTAINER_NODES.has(name) || name === LIST_ITEM_NODE || name === BLOCKQUOTE_NODE) {
      // Recurse into block containers; their block children become their own
      // segments (no list markers / blockquote markers in plain text).
      for (const seg of blocksToSegments(node.content, features)) {
        segments.push(seg);
      }
      return;
    }

    if (node.inlineContent) {
      // paragraph / heading: emit the inline text with no markdown markers.
      // An EMPTY regular paragraph is a markdown blank-line artifact (the
      // round-trip form of a single author-typed blank line) — skip it so two
      // real paragraphs are separated by exactly one blank line, not two.
      // Author-intended empty blocks use `blankParagraph` ([[blank]]), handled
      // above, which DOES emit an empty segment.
      const text = inlineFragmentToText(node.content, features);
      if (text.length > 0) segments.push(text);
      return;
    }

    if (node.childCount > 0) {
      // Unknown block wrapper: recurse so nested content is not dropped.
      for (const seg of blocksToSegments(node.content, features)) {
        segments.push(seg);
      }
      return;
    }

    // Leaf block (e.g. hr / image): contribute its text content, if any.
    const text = node.textContent;
    if (text.length > 0) segments.push(text);
  });

  return segments;
}

/**
 * Clipboard *text* serializer (AST-walk).
 *
 * Copying from the editor must put **clean plain text** on `text/plain`, not
 * the raw MDI/markdown that the default `@milkdown/plugin-clipboard` emits
 * (e.g. `# {花|か}`, escaped `\[\[blank]]`). Rather than serialize the slice to
 * markdown and then un-parse it with regexes (whack-a-mole on escapes, code
 * fences, list bullets, `.txt` literals), we walk the ProseMirror slice
 * directly. Text nodes are already LITERAL — no markdown to undo — and
 * structure (code / list / emphasis / MDI) is explicit in the node tree:
 *
 * - block nodes (paragraph, heading, list item, code block) are joined by a
 *   single blank line; an empty `blankParagraph` ([[blank]]) yields an extra
 *   intentional blank line;
 * - text nodes emit `node.text` verbatim (em/strong/link marks carry no text,
 *   so their markup simply never appears);
 * - inline-code marked text and `code_block` content are emitted verbatim,
 *   never MDI-converted;
 * - MDI nodes are gated per feature flag: enabled → converted, disabled →
 *   literal `.mdi` source. In non-MDI / `.txt` mode the MDI plugins are not
 *   installed, so these appear as literal text nodes and are emitted verbatim
 *   automatically.
 *
 * `text/html` is intentionally left to the default serializer so rich paste
 * into Word/Pages keeps headings, ruby (`<ruby>`), and structure.
 *
 * This plugin is registered as part of `japaneseNovel(...)`, which is `.use()`d
 * before `@milkdown/plugin-clipboard`; ProseMirror's `someProp` walks plugins
 * in order and uses the first non-null `clipboardTextSerializer`, so ours wins.
 */
export function createClipboardSerializerPlugin(
  _ctx: Ctx,
  options: ClipboardSerializerOptions,
): Plugin {
  // `plainText` needs no special casing in the AST walk: in `.txt` mode the MDI
  // plugins are not installed and `remarkPlainTextPlugin` keeps `*` / `#` / `**`
  // as literal text nodes, which the walk already emits verbatim.
  const { features } = options;

  return new Plugin({
    key: new PluginKey("mdiClipboardSerializer"),
    props: {
      clipboardTextSerializer: (slice) => {
        const segments = blocksToSegments(slice.content, features);
        return segments.join("\n\n");
      },
    },
  });
}
