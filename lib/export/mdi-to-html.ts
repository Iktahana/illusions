/**
 * MDI-to-HTML converter
 *
 * Converts MDI (Markdown for Illusions) syntax to HTML.
 * Uses markdown-it as the base markdown parser with inline token rules
 * for MDI-specific extensions: ruby, tate-chu-yoko, no-break, kerning.
 */

import MarkdownIt from "markdown-it";

import { PAGE_DIMENSIONS } from "./pdf-export-settings";

import type { ExportPageSize } from "./export-settings";
import type { ExportMetadata, Chapter } from "./types";
import {
  MDI_RUBY_RE,
  MDI_TCY_RE,
  MDI_NOBR_RE,
  MDI_KERN_RE,
  MDI_BREAK_RE,
  MDI_KERN_AMOUNT_RE,
  MDI_BLANK_RE,
} from "./mdi-parser";

const MDI_RUBY_AT_START_RE = new RegExp(`^${MDI_RUBY_RE.source}`);
const MDI_TCY_AT_START_RE = new RegExp(`^${MDI_TCY_RE.source}`);
const MDI_NOBR_AT_START_RE = new RegExp(`^${MDI_NOBR_RE.source}`);
const MDI_KERN_AT_START_RE = new RegExp(`^${MDI_KERN_RE.source}`);
const MDI_BREAK_AT_START_RE = new RegExp(`^${MDI_BREAK_RE.source}`);

/**
 * Validate that a kern amount matches the expected pattern (e.g. "0.5em", "-1em", "+0.25em")
 */
function isValidKernAmount(amount: string): boolean {
  return MDI_KERN_AMOUNT_RE.test(amount);
}

/**
 * Build ruby HTML from base text and ruby text.
 * If ruby contains dots, split into per-character ruby pairs.
 * Otherwise, wrap the entire base with a single ruby annotation.
 *
 * base and ruby are HTML-escaped to prevent injection from user content.
 */
function buildRubyHtml(base: string, ruby: string): string {
  const rubyParts = ruby.split(".");
  const baseChars = [...base];

  if (rubyParts.length > 1 && rubyParts.length === baseChars.length) {
    // Split ruby: each dot-separated segment corresponds to one character
    return (
      "<ruby>" +
      baseChars
        .map((char, i) => `${escapeHtml(char)}<rt>${escapeHtml(rubyParts[i])}</rt>`)
        .join("") +
      "</ruby>"
    );
  }

  // Group ruby: wrap entire base text
  return `<ruby>${escapeHtml(base)}<rt>${escapeHtml(ruby)}</rt></ruby>`;
}

function matchMdiInlineSyntax(
  markdown: string,
  position: number,
): { length: number; html: string } | null {
  const remaining = markdown.slice(position);

  const rubyMatch = remaining.match(MDI_RUBY_AT_START_RE);
  if (rubyMatch) {
    return {
      length: rubyMatch[0].length,
      html: buildRubyHtml(rubyMatch[1], rubyMatch[2]),
    };
  }

  const tcyMatch = remaining.match(MDI_TCY_AT_START_RE);
  if (tcyMatch) {
    return {
      length: tcyMatch[0].length,
      html: `<span class="mdi-tcy">${escapeHtml(tcyMatch[1])}</span>`,
    };
  }

  const nobrMatch = remaining.match(MDI_NOBR_AT_START_RE);
  if (nobrMatch) {
    return {
      length: nobrMatch[0].length,
      html: `<span class="mdi-nobr">${escapeHtml(nobrMatch[1])}</span>`,
    };
  }

  const kernMatch = remaining.match(MDI_KERN_AT_START_RE);
  if (kernMatch && isValidKernAmount(kernMatch[1])) {
    return {
      length: kernMatch[0].length,
      html: `<span class="mdi-kern" style="--mdi-kern:${kernMatch[1]};">${escapeHtml(kernMatch[2])}</span>`,
    };
  }

  const breakMatch = remaining.match(MDI_BREAK_AT_START_RE);
  if (breakMatch) {
    return {
      length: breakMatch[0].length,
      html: '<br class="mdi-break">',
    };
  }

  return null;
}

function installMdiInlinePlugin(md: MarkdownIt): void {
  md.inline.ruler.after("escape", "mdi-inline", (state, silent) => {
    const match = matchMdiInlineSyntax(state.src, state.pos);
    if (!match) {
      return false;
    }

    if (!silent) {
      const token = state.push("html_inline", "", 0);
      token.content = match.html;
    }

    state.pos += match.length;
    return true;
  });
}

/**
 * Create a configured markdown-it instance.
 *
 * html is disabled to prevent user-authored HTML (e.g. <script>, <img onerror>)
 * from being passed through. Safe MDI-generated HTML (ruby, span, br) is emitted
 * only from the custom MDI inline tokenizer.
 */
function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    breaks: true,
  });

  installMdiInlinePlugin(md);

  return md;
}

/** Options for PDF typesetting CSS generation */
export interface MdiStylesheetOptions {
  verticalWriting?: boolean;
  fontFamily?: string;
  /** Font size in mm (calculated from page size, margins, and chars per line) */
  fontSizeMm?: number;
  /** Line height ratio (calculated from lines per page) */
  lineHeightRatio?: number;
  /** First-line indent in em units */
  textIndentEm?: number;
  /** Page margins in mm */
  margins?: { top: number; bottom: number; left: number; right: number };
  /** Page size for @page CSS rule (drives browser print dialog paper selection) */
  pageSize?: ExportPageSize;
  /** Landscape orientation for @page CSS rule */
  landscape?: boolean;
}

/**
 * Get CSS styles for MDI elements.
 *
 * When typesetting options (fontSizeMm, lineHeightRatio, etc.) are provided,
 * generates layout CSS for PDF export. Otherwise returns base MDI styles only.
 */
export function getMdiStylesheet(options?: MdiStylesheetOptions): string {
  const rules: string[] = [
    ".mdi-tcy { text-combine-upright: all; }",
    ".mdi-nobr { white-space: nowrap; word-break: keep-all; }",
    ".mdi-kern { letter-spacing: var(--mdi-kern, 0em); }",
    "br.mdi-break { /* inherits writing-mode; explicit rule for future customization */ }",
    "ruby rt { font-size: 0.5em; }",
  ];

  // Body styles for typesetting
  const bodyDecls: string[] = [];
  const hasTypesetting = options?.fontSizeMm != null || options?.lineHeightRatio != null;

  if (options?.verticalWriting) {
    bodyDecls.push("writing-mode: vertical-rl", "text-orientation: mixed");
  }
  if (options?.fontFamily) {
    bodyDecls.push(`font-family: ${sanitizeFontFamily(options.fontFamily)}`);
  }
  if (options?.fontSizeMm != null) {
    bodyDecls.push(`font-size: ${options.fontSizeMm.toFixed(2)}mm`);
  }
  if (options?.lineHeightRatio != null) {
    bodyDecls.push(`line-height: ${options.lineHeightRatio.toFixed(3)}`);
  }
  if (hasTypesetting) {
    bodyDecls.push("margin: 0", "padding: 0");
  }

  if (bodyDecls.length > 0) {
    rules.push(`body { ${bodyDecls.join("; ")}; }`);
  }

  // Paragraph indent
  if (options?.textIndentEm != null && options.textIndentEm > 0) {
    rules.push(`p { text-indent: ${options.textIndentEm}em; }`);
  }

  // @page rule: margins + page size (combined into one rule to avoid browser merge issues)
  const pageDecls: string[] = [];
  if (options?.margins) {
    const { top, bottom, left, right } = options.margins;
    pageDecls.push(`margin: ${top}mm ${right}mm ${bottom}mm ${left}mm`);
  }
  if (options?.pageSize) {
    const dims = PAGE_DIMENSIONS[options.pageSize] ?? PAGE_DIMENSIONS["A4"];
    const w = options.landscape ? dims.height : dims.width;
    const h = options.landscape ? dims.width : dims.height;
    pageDecls.push(`size: ${w}mm ${h}mm`);
  }
  if (pageDecls.length > 0) {
    rules.push(`@page { ${pageDecls.join("; ")}; }`);
  }

  return rules.join("\n");
}

/**
 * Convert full MDI markdown to an HTML document string.
 *
 * @param markdown - MDI-flavored markdown source
 * @param options.metadata - Document metadata (title, author, etc.)
 * @param options.verticalWriting - Enable vertical writing mode
 * @param options.bodyOnly - If true, return only the inner HTML content without document wrapper
 * @param options.typesetting - PDF typesetting options forwarded to getMdiStylesheet()
 * @returns Complete HTML document string, or body content if bodyOnly is true
 */
export function mdiToHtml(
  markdown: string,
  options?: {
    metadata?: ExportMetadata;
    verticalWriting?: boolean;
    bodyOnly?: boolean;
    typesetting?: Omit<MdiStylesheetOptions, "verticalWriting">;
    /** Google Font family name to inject as <link> tag (e.g. "Noto Serif JP") */
    googleFontFamily?: string;
  },
): string {
  const md = createMarkdownIt();
  // Pre-process: replace [[blank]] paragraph markers with a U+E000 PUA sentinel.
  // markdown-it will wrap the sentinel in <p>…</p>; we swap it for an empty <p></p> after rendering.
  const BLANK_SENTINEL = "";
  const preprocessed = markdown.replace(new RegExp(MDI_BLANK_RE.source, "gm"), BLANK_SENTINEL);
  const rawHtml = md.render(preprocessed);
  // Replace the sentinel paragraph with a true empty paragraph.
  const bodyHtml = rawHtml.replace(new RegExp(`<p>${BLANK_SENTINEL}\\s*</p>`, "g"), "<p></p>");

  if (options?.bodyOnly) {
    return bodyHtml;
  }

  const lang = options?.metadata?.language ?? "ja";
  const title = options?.metadata?.title ?? "";
  const stylesheet = getMdiStylesheet({
    verticalWriting: options?.verticalWriting,
    ...options?.typesetting,
  });

  // Build <meta> tags for optional metadata
  // Include a strict CSP to block script execution in export output.
  // When a Google Font is requested, allow external stylesheet and font sources.
  const hasGoogleFont = !!options?.googleFontFamily;
  const styleSrc = hasGoogleFont
    ? "style-src 'unsafe-inline' https://fonts.googleapis.com"
    : "style-src 'unsafe-inline'";
  const fontSrc = hasGoogleFont ? " font-src https://fonts.gstatic.com;" : "";
  const metaTags: string[] = [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${styleSrc}; img-src 'self';${fontSrc}">`,
  ];

  if (options?.metadata?.author) {
    metaTags.push(`<meta name="author" content="${escapeHtmlAttr(options.metadata.author)}">`);
  }

  if (options?.metadata?.date) {
    metaTags.push(`<meta name="date" content="${escapeHtmlAttr(options.metadata.date)}">`);
  }

  // Google Font <link> tag
  const googleFontLink = hasGoogleFont
    ? `  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(options!.googleFontFamily!)}&display=swap">`
    : "";

  return [
    "<!DOCTYPE html>",
    `<html lang="${escapeHtmlAttr(lang)}">`,
    "<head>",
    ...metaTags.map((tag) => `  ${tag}`),
    `  <title>${escapeHtml(title)}</title>`,
    ...(googleFontLink ? [googleFontLink] : []),
    "  <style>",
    `    ${stylesheet.split("\n").join("\n    ")}`,
    "  </style>",
    "</head>",
    "<body>",
    bodyHtml,
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * Split MDI markdown into chapters by headings.
 *
 * Content before the first heading becomes a chapter with an empty title.
 * Each chapter's htmlContent is generated with bodyOnly mode.
 *
 * @param markdown - Full MDI markdown document
 * @param splitLevel - Max heading level to split on (1=H1, 2=H1+H2, 3=H1+H2+H3, 0=no split)
 * @returns Array of Chapter objects
 */
export function splitIntoChapters(markdown: string, splitLevel: number = 1): Chapter[] {
  // No splitting — entire document is one chapter
  if (splitLevel <= 0) {
    const html = mdiToHtml(markdown, { bodyOnly: true });
    return [{ title: "", htmlContent: html, level: 1 }];
  }

  const chapters: Chapter[] = [];
  const lines = markdown.split("\n");

  let currentTitle = "";
  let currentLevel = 1;
  let currentLines: string[] = [];
  let hasStarted = false;

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);

    if (headingMatch && headingMatch[1].length <= splitLevel) {
      // Flush previous chapter
      if (hasStarted || currentLines.length > 0) {
        const content = currentLines.join("\n").trim();
        chapters.push({
          title: currentTitle,
          htmlContent: content ? mdiToHtml(content, { bodyOnly: true }) : "",
          level: currentLevel,
        });
      }

      currentTitle = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentLines = [];
      hasStarted = true;
    } else {
      currentLines.push(line);
      if (!hasStarted && line.trim() !== "") {
        hasStarted = true;
      }
    }
  }

  // Flush the last chapter
  if (hasStarted || currentLines.length > 0) {
    const content = currentLines.join("\n").trim();
    chapters.push({
      title: currentTitle,
      htmlContent: content ? mdiToHtml(content, { bodyOnly: true }) : "",
      level: currentLevel,
    });
  }

  return chapters;
}

/**
 * Sanitize a font-family CSS value.
 *
 * Accepts generic families, quoted font names (e.g. `"Noto Serif JP", serif`),
 * and bare font family names. Rejects values containing dangerous CSS characters.
 * Falls back to "serif" for truly unknown/malicious values.
 */
function sanitizeFontFamily(value: string): string {
  if (!value) return "serif";
  // Allow generic CSS families
  if (value === "serif" || value === "sans-serif" || value === "monospace") return value;
  // Reject values with dangerous CSS characters (semicolons, braces, url(), etc.)
  if (/[;{}()]|url\s*\(/i.test(value)) return "serif";
  // Accept any quoted font name or comma-separated list
  return value;
}

/**
 * Escape a string for use in HTML text content
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escape a string for use in an HTML attribute value
 */
function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
