/**
 * Shared MDI inline syntax parser — re-export shim.
 *
 * @deprecated The implementation moved to the single MDI entry module
 * `@/packages/milkdown-plugin-japanese-novel/mdi-document` (issue #1449).
 * Import from there (or use `MdiDocument`) in new code. This shim is kept so
 * existing imports keep working during the migration window.
 */

export {
  MDI_RUBY_RE,
  MDI_TCY_RE,
  MDI_NOBR_RE,
  MDI_KERN_RE,
  MDI_BREAK_RE,
  MDI_BLANK_MARKER,
  MDI_BLANK_RE,
  MDI_ESC_BRACE_RE,
  MDI_ESC_CARET_RE,
  MDI_ESC_BRACKET_RE,
  MDI_KERN_AMOUNT_RE,
  isMdiBlankParagraphLine,
  stripMdiBlankMarkers,
  stripMdiInlineSyntax,
  replaceMdiWithRubyText,
} from "@/packages/milkdown-plugin-japanese-novel/mdi-document";
