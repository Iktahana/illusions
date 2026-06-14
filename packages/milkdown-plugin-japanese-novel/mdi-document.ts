/**
 * MdiDocument — single entry API for MDI string-marker <-> text derivations.
 *
 * Issue #1449: the `[[blank]]` marker introduced in PR #1425 spread its
 * responsibilities across three layers (string-level sanitize in
 * lib/tab-manager, AST-level parse in this package's `remarkMdiBlankPlugin`,
 * and per-consumer `stripMdiBlankMarkers` calls). This module consolidates
 * ALL string-level marker conversions in one place; consumers pick the typed
 * derivation instead of remembering which transform to apply:
 *
 * - `toRawText()`      — save / file-watcher comparison (markers preserved)
 * - `toAnalysisText()` — NLP / readability / statistics (markers removed)
 * - `toExportText(f)`  — plain-text export (txt / txt-ruby)
 * - `toEditorContent()`— Milkdown / ProseMirror input (markers preserved;
 *                        AST conversion is done by `remarkMdiBlankPlugin` +
 *                        `blankParagraphSchema` registered in this package)
 *
 * HTML / DOCX export pipelines need format-specific structures (markdown-it
 * tokens, docx Paragraph objects) and therefore stay in `lib/export/*`, but
 * they consume the marker primitives exported here (`MDI_BLANK_RE`,
 * `isMdiBlankParagraphLine`, `replaceMdiWithRubyText`, ...) so the marker
 * semantics remain defined in exactly one module.
 *
 * ## `[[blank]]` literal typed by the user (defined semantics)
 *
 * - A line consisting solely of `[[blank]]` (surrounding ASCII whitespace
 *   allowed) is ALWAYS a blank-paragraph marker. A user who literally types
 *   `[[blank]]` on its own line gets a forced empty paragraph: the editor
 *   renders an empty `<p>`, analysis text drops the line, and no exporter
 *   emits the literal. There is no escape that survives a `.mdi` save
 *   round-trip, because the editor-output normalization (Step 0 below)
 *   intentionally unescapes `\[\[blank]]` back to `[[blank]]`.
 * - `[[blank]]` appearing inside a line with other text (e.g.
 *   `foo [[blank]] bar`) is NOT a marker and is preserved as literal text by
 *   every derivation and every exporter.
 *
 * These are the behaviors as of PR #1425 / #1483; this module documents and
 * pins them with tests rather than changing them.
 */

// ---------------------------------------------------------------------------
// Regex patterns — single source of truth for all MDI inline constructs
// ---------------------------------------------------------------------------

/** Ruby annotation: {base|ruby} */
export const MDI_RUBY_RE = /\{([^|{}]+)\|([^|}]+)\}/g;

/** Tate-chu-yoko: ^text^ */
export const MDI_TCY_RE = /\^([^^]+)\^/g;

/** No-break span: [[no-break:text]] */
export const MDI_NOBR_RE = /\[\[no-break:([^\]]+)\]\]/g;

/** Kerning: [[kern:amount:text]] */
export const MDI_KERN_RE = /\[\[kern:([^:\]]+):([^\]]+)\]\]/g;

/** MDI explicit line break: [[br]] */
export const MDI_BREAK_RE = /\[\[br\]\]/g;

/** MDI blank paragraph marker literal */
export const MDI_BLANK_MARKER = "[[blank]]";

/**
 * MDI blank paragraph marker (whole line; written by editor-output
 * normalization). Whitespace-tolerant on BOTH sides to match
 * `isMdiBlankParagraphLine` — the line-based exporters have always trimmed
 * before matching, so an indented "  [[blank]]" renders as a blank paragraph;
 * analysis text must strip the same lines (pre-#1449 the strip regex was
 * line-start-anchored, a marker-handling drift this module exists to end).
 */
export const MDI_BLANK_RE = /^[ \t]*\[\[blank\]\][ \t]*\r?$/gm;

/** Escaped MDI opening brace: \{ */
export const MDI_ESC_BRACE_RE = /\\(\{)/g;

/** Escaped MDI caret: \^ */
export const MDI_ESC_CARET_RE = /\\(\^)/g;

/** Escaped MDI bracket: \[ */
export const MDI_ESC_BRACKET_RE = /\\(\[)/g;

/** Valid kern amount pattern (e.g. "0.5em", "-1em", "+0.25em") */
export const MDI_KERN_AMOUNT_RE = /^[+-]?\d+(\.\d+)?em$/;

// ---------------------------------------------------------------------------
// Blank paragraph marker primitives
// ---------------------------------------------------------------------------

/**
 * Whether a single line is a blank-paragraph marker line.
 * Line-based exporters (txt, docx) use this instead of comparing literals.
 */
export function isMdiBlankParagraphLine(line: string): boolean {
  return line.trim() === MDI_BLANK_MARKER;
}

/**
 * Strip `[[blank]]` marker lines for plain-text analysis consumers
 * (NLP, word count, readability, etc.).
 * Replaces the marker line with empty string; surrounding blank lines remain.
 * Inline occurrences (`foo [[blank]] bar`) are preserved as literal text.
 * CRLF note: on CRLF files a preceding \r is absorbed; normalize line endings
 * before passing if required.
 *
 * Prefer `MdiDocument.fromRawText(text).toAnalysisText()` in new code.
 */
export function stripMdiBlankMarkers(content: string): string {
  return content.replace(MDI_BLANK_RE, "");
}

// ---------------------------------------------------------------------------
// Plain-text transformation (strip all MDI markup, discard ruby readings)
// ---------------------------------------------------------------------------

/**
 * Strip all MDI inline syntax from text, keeping only base text.
 * Ruby readings are discarded: {漢字|かんじ} → 漢字
 *
 * NOTE: this is intentionally NOT part of `toAnalysisText()`. Flattening
 * inline syntax changes character offsets and token counts, which would alter
 * NLP / readability / statistics outputs (issue #1449 hard constraint).
 * Consumers that need flattened display text (e.g. TOC titles) call this
 * explicitly.
 */
export function stripMdiInlineSyntax(text: string): string {
  let result = text;

  // Ruby: keep base, discard ruby
  result = result.replace(MDI_RUBY_RE, "$1");

  // Tate-chu-yoko: keep text
  result = result.replace(MDI_TCY_RE, "$1");

  // No-break: keep text
  result = result.replace(MDI_NOBR_RE, "$1");

  // Kerning: keep text
  result = result.replace(MDI_KERN_RE, "$2");

  // Explicit line break: newline
  result = result.replace(MDI_BREAK_RE, "\n");

  return result;
}

// ---------------------------------------------------------------------------
// Ruby-text transformation (ruby in fullwidth parentheses)
// ---------------------------------------------------------------------------

/**
 * Replace MDI inline syntax, rendering ruby as fullwidth parentheses.
 * Used by txt export (ruby mode) and the docx exporter.
 * Example: {漢字|かんじ} → 漢字（かんじ）
 */
export function replaceMdiWithRubyText(text: string): string {
  return replaceMdiWithRubyTextGated(text, ALL_MDI_FEATURES_ENABLED);
}

/**
 * Per-feature MDI macro flags. Each flag gates exactly one macro family so a
 * consumer that enables only ruby (for example) still copies literal `^2024^`
 * and `[[br]]` verbatim. Mirrors the parsing flags passed to
 * `japaneseNovel(options)` (see `config.ts`).
 */
export interface MdiFeatureFlags {
  /** `{base|ruby}` → `base（ruby）` */
  enableRuby: boolean;
  /** `^text^` → `text` */
  enableTcy: boolean;
  /** `[[no-break:text]]` → `text` */
  enableNoBreak: boolean;
  /** `[[kern:amount:text]]` → `text` */
  enableKern: boolean;
  /** `[[br]]` → newline */
  enableMdiBreak: boolean;
}

/** All macro families enabled — used by the legacy whole-string export helpers. */
const ALL_MDI_FEATURES_ENABLED: MdiFeatureFlags = {
  enableRuby: true,
  enableTcy: true,
  enableNoBreak: true,
  enableKern: true,
  enableMdiBreak: true,
};

/**
 * Replace MDI inline syntax with per-feature gating. A macro family whose flag
 * is `false` is left as literal text verbatim — only enabled families are
 * transformed. Ruby renders as fullwidth parentheses (txt-ruby semantics).
 */
export function replaceMdiWithRubyTextGated(text: string, flags: MdiFeatureFlags): string {
  let result = text;

  // Ruby: base（ruby）  — strip dots from split ruby
  if (flags.enableRuby) {
    result = result.replace(MDI_RUBY_RE, (_match, base: string, ruby: string) => {
      const cleanRuby = ruby.replace(/\./g, "");
      return `${base}（${cleanRuby}）`;
    });
  }

  // Tate-chu-yoko: keep text
  if (flags.enableTcy) {
    result = result.replace(MDI_TCY_RE, "$1");
  }

  // No-break: keep text
  if (flags.enableNoBreak) {
    result = result.replace(MDI_NOBR_RE, "$1");
  }

  // Kerning: keep text
  if (flags.enableKern) {
    result = result.replace(MDI_KERN_RE, "$2");
  }

  // Explicit line break: newline
  if (flags.enableMdiBreak) {
    result = result.replace(MDI_BREAK_RE, "\n");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Plain-text export pipeline (markdown stripping + Japanese typesetting)
// ---------------------------------------------------------------------------

/** Sentinel to distinguish scene breaks from paragraph-separation blank lines */
const SCENE_BREAK_MARKER = "\x00SCENE_BREAK\x00";

// ---------------------------------------------------------------------------
// Code-context placeholders
// ---------------------------------------------------------------------------
//
// To keep inline-code and fenced-code text out of the MDI/markdown rewriting
// pipeline, the clipboard serializer replaces each code segment's text with a
// NUL-wrapped placeholder before building the markdown string. NUL bytes never
// appear in user text and are not matched by any MDI / markdown regex, so the
// placeholder survives `replaceMdiWithRubyTextGated`, `stripMarkdown`, and
// `collapseBlankLines` untouched and is restored verbatim afterwards.

/** Prefix/suffix for code placeholders (NUL-wrapped, regex-inert). */
const CODE_PLACEHOLDER_PREFIX = "\x00MDI_CODE_";
const CODE_PLACEHOLDER_SUFFIX = "\x00";

/** Build the placeholder token for the code segment at `index`. */
export function codePlaceholder(index: number): string {
  return `${CODE_PLACEHOLDER_PREFIX}${index}${CODE_PLACEHOLDER_SUFFIX}`;
}

/**
 * Restore code placeholders with their verbatim segment text.
 * No-op when `segments` is undefined/empty.
 */
function restoreCodePlaceholders(text: string, segments?: readonly string[]): string {
  if (!segments || segments.length === 0) return text;
  return text.replace(
    new RegExp(`${CODE_PLACEHOLDER_PREFIX}(\\d+)${CODE_PLACEHOLDER_SUFFIX}`, "g"),
    (_match, idx: string) => {
      const segment = segments[Number(idx)];
      return segment ?? _match;
    },
  );
}

/**
 * Resolve CommonMark backslash-escapes (`\#` → `#`, `\*` → `*`, `\\` → `\`).
 * Covers every ASCII punctuation char CommonMark allows to be escaped,
 * including MDI-specific chars (`\{` `\^` `\[`) as a superset.
 *
 * Used both inside {@link stripMarkdown} and by the plain-text clipboard bypass,
 * where markup stripping must NOT run but serializer-added escapes still need to
 * be undone so the user gets verbatim characters.
 */
function unescapeCommonMark(text: string): string {
  return text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
}

/**
 * Strip markdown formatting while preserving text structure.
 * Handles headings, bold, italic, horizontal rules, etc.
 */
function stripMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    let processed = line;

    // [[blank]] paragraph marker → forced blank line (via SCENE_BREAK_MARKER)
    if (isMdiBlankParagraphLine(processed)) {
      result.push(SCENE_BREAK_MARKER);
      continue;
    }

    // Headings: # Title → Title
    processed = processed.replace(/^#{1,6}\s+/, "");

    // Horizontal rules: --- / *** / ___ → empty line
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(processed.trim())) {
      result.push(SCENE_BREAK_MARKER);
      continue;
    }

    // List bullets: strip a line-leading list marker (`* `, `- `, `+ `, `N. `)
    // to its bare text BEFORE emphasis processing. The Milkdown serializer emits
    // unordered lists as `* item …`; if the leading `* ` reached the italic
    // regex below it would be consumed as an opening emphasis delimiter, eating
    // the bullet and leaving a dangling `*` (e.g. `* a *it*` → ` a it*`). A
    // horizontal-rule line (`***` / `---`) has no space after the marker, so it
    // is handled above and never matches here. Indentation before the marker is
    // tolerated for nested lists.
    processed = processed.replace(/^\s*(?:[*+-]\s+|\d+\.\s+)/, "");

    // Bold italic: ***text*** → text
    processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, "$1");

    // Bold: **text** → text
    processed = processed.replace(/\*\*(.+?)\*\*/g, "$1");

    // Italic: *text* → text
    processed = processed.replace(/\*(.+?)\*/g, "$1");

    // CommonMark escapable punctuation: \# \* \_ \- \+ \. \! \\ etc. → literal
    processed = unescapeCommonMark(processed);

    result.push(processed);
  }

  return result.join("\n");
}

/**
 * Remove blank lines between paragraphs for Japanese typesetting (組版).
 * Scene breaks are preserved as a single blank line separator.
 */
function collapseBlankLines(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let consecutiveBlankCount = 0;

  for (const line of lines) {
    if (line === SCENE_BREAK_MARKER) {
      consecutiveBlankCount = 0;
      result.push("");
      continue;
    }

    if (line.trim() === "") {
      consecutiveBlankCount++;
      // First blank line is structural (Markdown paragraph separator) — skip it.
      // Additional blank lines are author-intentional — preserve them.
      if (consecutiveBlankCount > 1) {
        result.push("");
      }
      continue;
    }

    consecutiveBlankCount = 0;
    result.push(line);
  }

  // Trim leading/trailing blank lines — no content to separate at boundaries
  while (result.length > 0 && result[0] === "") {
    result.shift();
  }
  while (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }

  return result.join("\n");
}

// ---------------------------------------------------------------------------
// Editor-output normalization (string-level sanitize before persisting)
// ---------------------------------------------------------------------------

/**
 * Known HTML tag names that may be injected by the editor (ProseMirror/Milkdown)
 * and should be stripped when saving to .mdi format.
 *
 * Only properly paired tags (e.g. `<div>...</div>`) and void elements
 * (e.g. `<img>`, `<hr>`) are removed. Orphaned non-void tags like a bare
 * `<B>` are left intact so that arbitrary angle-bracket content
 * (e.g. math expressions `A<B>C`) is not silently destroyed.
 */
const PAIRED_HTML_TAGS = [
  "a",
  "abbr",
  "article",
  "aside",
  "b",
  "blockquote",
  "body",
  "caption",
  "cite",
  "code",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h[1-6]",
  "head",
  "header",
  "html",
  "i",
  "iframe",
  "ins",
  "kbd",
  "label",
  "li",
  "main",
  "mark",
  "nav",
  "noscript",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "section",
  "select",
  "small",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "u",
  "ul",
  "var",
  "video",
] as const;

/**
 * Void HTML elements that are self-closing and cannot have content.
 * These are safe to strip even when not paired, since tag names like
 * `img`, `hr`, `wbr` etc. are unambiguous and won't collide with
 * user-authored angle-bracket content.
 */
const VOID_HTML_TAGS = [
  "area",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
] as const;

/** Regex matching void HTML elements (opening or self-closing form). */
const VOID_TAG_PATTERN = new RegExp(`<(${VOID_HTML_TAGS.join("|")})(\\s[^>]*)?\\/?>`, "gi");

/** Options for {@link MdiDocument.fromEditorOutput}. */
export interface MdiEditorOutputOptions {
  /**
   * File extension the content will be persisted as (".mdi" | ".md" | ".txt").
   * Marker recovery (Step 0) and blank-paragraph conversion (Step 1a) only
   * apply to ".mdi"; other types (or omitted) skip those steps.
   */
  fileType?: string;
}

/**
 * Normalize Milkdown/ProseMirror serializer output before persisting.
 * Strips known HTML tags that should not appear in .mdi files,
 * while preserving arbitrary angle-bracket content (e.g. `A<B>C`).
 *
 * Step 1a (".mdi" only) converts standalone `<br />` lines to `[[blank]]`
 * markers before Step 1b handles remaining inline `<br>` tags.
 */
function normalizeEditorOutput(content: string, options?: MdiEditorOutputOptions): string {
  let result = content;
  // Step 0 (MDI only): the Milkdown markdown serializer escapes the leading `[`
  // of MDI bracket macros (`[[blank]]`, `[[br]]`, `[[no-break:…]]`, `[[kern:…]]`)
  // to `\[`, because CommonMark treats `[` as a link/reference opener. The result
  // is `\[\[blank]]` on disk instead of `[[blank]]`. Strip those backslashes so
  // the macros round-trip as authored. Backslashes before `]` are optional too,
  // in case a serializer config also escapes the closing brackets. Idempotent:
  // already-clean markers pass through unchanged.
  // Known limitation (documented behavior, see module JSDoc): this also means a
  // user cannot escape `[[blank]]` to keep it as literal text on its own line.
  if (options?.fileType === ".mdi") {
    result = result.replace(
      /\\?\[\\?\[(blank|br|no-break:[^\]\n]*|kern:[^\]\n]*)\\?\]\\?\]/g,
      "[[$1]]",
    );
  }
  // Step 1a (MDI only): standalone <br /> on its own line → [[blank]] marker.
  // Intentionally case-sensitive (lowercase only) — <BR /> falls through to Step 1b.
  // CRLF-safe: allows optional \r before end-of-line.
  // Known limitation: user-authored standalone <br /> in .mdi is treated as a blank paragraph
  // (same class of escape gap as other bracket macros).
  if (options?.fileType === ".mdi") {
    result = result.replace(/^<br\s*\/?>[ \t]*\r?$/gm, "[[blank]]");
  }
  // Step 1b: remaining inline <br> tags → newline (case-insensitive)
  result = result.replace(/<br\s*\/?>/gi, "\n");
  // Step 2: Remove properly paired known HTML tags, keeping inner content.
  // Only matched pairs (e.g. <div>...</div>) are stripped; an orphaned
  // `<B>` without a closing `</B>` is left untouched.
  // Loop until stable so nested identical tags (e.g. <div><div>x</div></div>)
  // are fully stripped.
  const pairedTagPattern = new RegExp(
    `<(${PAIRED_HTML_TAGS.join("|")})(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`,
    "gi",
  );
  let prev = result;
  result = result.replace(pairedTagPattern, "$3");
  while (result !== prev) {
    prev = result;
    result = result.replace(pairedTagPattern, "$3");
  }
  // Step 3: Remove void HTML elements (img, hr, etc.) which are always
  // self-closing and cannot be confused with user content.
  result = result.replace(VOID_TAG_PATTERN, "");
  return result;
}

// ---------------------------------------------------------------------------
// MdiDocument — typed derivations over a single raw-text source of truth
// ---------------------------------------------------------------------------

/** Plain-text export formats handled by {@link MdiDocument.toExportText}. */
export type MdiExportTextFormat = "txt" | "txt-ruby";

/**
 * Immutable wrapper around MDI raw text providing the typed derivations
 * described in issue #1449. See module JSDoc for the derivation matrix.
 */
export class MdiDocument {
  private constructor(private readonly raw: string) {}

  /** Wrap raw on-disk MDI text (no transformation applied). */
  static fromRawText(raw: string): MdiDocument {
    return new MdiDocument(raw);
  }

  /**
   * Wrap Milkdown/ProseMirror serializer output, normalizing editor-injected
   * HTML and recovering escaped MDI bracket macros (".mdi" only).
   * This is the canonical save-path entry (lib/tab-manager).
   */
  static fromEditorOutput(serialized: string, options?: MdiEditorOutputOptions): MdiDocument {
    return new MdiDocument(normalizeEditorOutput(serialized, options));
  }

  /**
   * Raw MDI text with all markers preserved.
   * Use for persistence and file-watcher content comparison.
   */
  toRawText(): string {
    return this.raw;
  }

  /**
   * Text for NLP / readability / statistics: `[[blank]]` marker lines are
   * removed; inline MDI syntax (ruby, tcy, ...) is intentionally preserved so
   * analysis outputs stay identical to the pre-#1449 pipeline (see
   * {@link stripMdiInlineSyntax} for why flattening is not applied here).
   */
  toAnalysisText(): string {
    return stripMdiBlankMarkers(this.raw);
  }

  /**
   * Plain-text export. `[[blank]]` markers become forced blank lines, MDI
   * inline syntax is flattened ("txt") or rendered with fullwidth-paren ruby
   * ("txt-ruby"), markdown formatting is stripped, and blank lines are
   * collapsed for Japanese typesetting.
   *
   * HTML / DOCX exports need format-specific pipelines and live in
   * `lib/export/mdi-to-html.ts` / `lib/export/docx-exporter.ts`; they build on
   * this module's marker primitives.
   */
  toExportText(format: MdiExportTextFormat): string {
    const flattened =
      format === "txt-ruby" ? replaceMdiWithRubyText(this.raw) : stripMdiInlineSyntax(this.raw);
    return collapseBlankLines(stripMarkdown(flattened));
  }

  /**
   * Plain text for the clipboard (`text/plain`).
   *
   * MDI macro conversion is gated **per feature** (`options.features`): a macro
   * family whose flag is `false` is preserved verbatim, so a session with only
   * ruby enabled still copies literal `^2024^` / `[[br]]` unchanged. When every
   * flag is `false` this collapses to the non-MDI behavior (markdown markup
   * stripped, CommonMark backslash-escapes resolved, macros verbatim).
   *
   * Code context is honored via `options.codeSegments`: the serializer replaces
   * inline-code and fenced-code text with NUL-wrapped placeholders before
   * calling this method; the placeholders pass through the MDI / markdown
   * pipeline untouched and are restored verbatim at the end, so `{花|か}`,
   * `^2024^`, `[[br]]` inside code never get transformed or markdown-stripped.
   *
   * Plain-text mode (`options.plainText === true`, i.e. `.txt` documents where
   * MilkdownEditor installs `remarkPlainTextPlugin` and `*` / `#` / `**` are
   * LITERAL characters, not markdown) bypasses both MDI conversion and markdown
   * stripping entirely: a `.txt` line `**literal**` or `# heading` must copy
   * verbatim, not as `literal` / `heading`. Only structural paragraph blank
   * lines are collapsed and serializer-added CommonMark escapes are resolved.
   *
   * In all modes the result has collapsed blank lines for clean pasting.
   */
  toClipboardText(options: {
    features: MdiFeatureFlags;
    codeSegments?: readonly string[];
    plainText?: boolean;
  }): string {
    if (options.plainText) {
      // No MDI conversion, no markdown stripping — characters are literal.
      const literal = collapseBlankLines(unescapeCommonMark(this.raw));
      return restoreCodePlaceholders(literal, options.codeSegments);
    }
    const converted = replaceMdiWithRubyTextGated(this.raw, options.features);
    const stripped = collapseBlankLines(stripMarkdown(converted));
    return restoreCodePlaceholders(stripped, options.codeSegments);
  }

  /**
   * Content to feed Milkdown / ProseMirror. Markers are kept verbatim:
   * the string→AST conversion is owned by `remarkMdiBlankPlugin` (parse) and
   * `blankParagraphSchema` (round-trip serialization) in this package.
   */
  toEditorContent(): string {
    return this.raw;
  }
}
