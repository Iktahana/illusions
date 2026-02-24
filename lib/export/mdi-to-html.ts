/**
 * MDI-to-HTML converter
 *
 * Converts MDI (Markdown for Illusions) syntax to HTML.
 * Uses markdown-it as the base markdown parser with pre-processing
 * for MDI-specific extensions: ruby, tate-chu-yoko, no-break, kerning.
 */

import MarkdownIt from "markdown-it";

import type { ExportMetadata, Chapter } from "./types";

// Placeholder prefix/suffix using Unicode Private Use Area (U+E000).
// PUA characters survive markdown-it rendering (unlike \u0000 which is replaced
// with U+FFFD) and will not appear in normal Japanese text content.
const PLACEHOLDER_PREFIX = "\uE000MDI_PLACEHOLDER_";
const PLACEHOLDER_SUFFIX = "\uE000";

/**
 * Validate that a kern amount matches the expected pattern (e.g. "0.5em", "-1em", "+0.25em")
 */
function isValidKernAmount(amount: string): boolean {
  return /^[+-]?\d+(\.\d+)?em$/.test(amount);
}

/**
 * Build ruby HTML from base text and ruby text.
 * If ruby contains dots, split into per-character ruby pairs.
 * Otherwise, wrap the entire base with a single ruby annotation.
 */
function buildRubyHtml(base: string, ruby: string): string {
  const rubyParts = ruby.split(".");

  if (rubyParts.length > 1 && rubyParts.length === [...base].length) {
    // Split ruby: each dot-separated segment corresponds to one character
    const baseChars = [...base];
    return (
      "<ruby>" +
      baseChars
        .map((char, i) => `${char}<rt>${rubyParts[i]}</rt>`)
        .join("") +
      "</ruby>"
    );
  }

  // Group ruby: wrap entire base text
  return `<ruby>${base}<rt>${ruby}</rt></ruby>`;
}

/** Result of MDI syntax pre-processing before markdown-it rendering */
interface MdiPreProcessResult {
  /** Markdown text with MDI syntax replaced by placeholders */
  text: string;
  /** Map of placeholder keys to their HTML replacements */
  placeholders: Map<string, string>;
}

/**
 * Pre-process MDI inline syntax, replacing MDI constructs with placeholders.
 *
 * Placeholders are restored AFTER markdown-it rendering via restorePlaceholders().
 * This allows markdown-it to run with html:false (blocking user-authored HTML)
 * while preserving the safe HTML generated from MDI syntax.
 *
 * Processes (in order):
 * 1. Escaped MDI syntax (backslash-prefixed) - preserved as literal text
 * 2. Ruby: {base|ruby} -> <ruby>...</ruby>
 * 3. Tate-chu-yoko: ^text^ -> <span class="mdi-tcy">text</span>
 * 4. No-break: [[no-break:text]] -> <span class="mdi-nobr">text</span>
 * 5. Kerning: [[kern:amount:text]] -> <span class="mdi-kern" style="--mdi-kern:amount;">text</span>
 */
function preProcessMdiSyntax(markdown: string): MdiPreProcessResult {
  // Store replacements to avoid double-processing
  const placeholders: Map<string, string> = new Map();
  let placeholderIndex = 0;

  function addPlaceholder(html: string): string {
    const key = `${PLACEHOLDER_PREFIX}${placeholderIndex}${PLACEHOLDER_SUFFIX}`;
    placeholderIndex++;
    placeholders.set(key, html);
    return key;
  }

  let result = markdown;

  // 1. Handle escaped MDI syntax (backslash before special chars)
  // Escape sequences: \{, \^, \[
  result = result.replace(/\\(\{)/g, (_match, char) =>
    addPlaceholder(char as string)
  );
  result = result.replace(/\\(\^)/g, (_match, char) =>
    addPlaceholder(char as string)
  );
  result = result.replace(/\\(\[)/g, (_match, char) =>
    addPlaceholder(char as string)
  );

  // 2. Ruby: {base|ruby}
  // Match {non-empty-base|non-empty-ruby} but not escaped
  result = result.replace(
    /\{([^{}|]+)\|([^{}|]+)\}/g,
    (_match, base: string, ruby: string) => addPlaceholder(buildRubyHtml(base, ruby))
  );

  // 3. Tate-chu-yoko: ^text^
  // Match ^non-empty-text^ but not escaped
  result = result.replace(
    /\^([^^]+)\^/g,
    (_match, text: string) =>
      addPlaceholder(`<span class="mdi-tcy">${text}</span>`)
  );

  // 4. No-break: [[no-break:text]]
  result = result.replace(
    /\[\[no-break:([^\]]+)\]\]/g,
    (_match, text: string) =>
      addPlaceholder(`<span class="mdi-nobr">${text}</span>`)
  );

  // 5. Kerning: [[kern:amount:text]]
  result = result.replace(
    /\[\[kern:([^:\]]+):([^\]]+)\]\]/g,
    (_match, amount: string, text: string) => {
      if (!isValidKernAmount(amount)) {
        // Invalid kern amount: return the original text unmodified
        return _match;
      }
      return addPlaceholder(
        `<span class="mdi-kern" style="--mdi-kern:${amount};">${text}</span>`
      );
    }
  );

  return { text: result, placeholders };
}

/**
 * Restore MDI placeholders in rendered HTML with their actual HTML content.
 *
 * Called after markdown-it rendering to inject the safe MDI HTML elements
 * (ruby, tcy, nobr, kern) that were protected during markdown-it processing.
 * Because markdown-it may HTML-escape the null-byte placeholder characters,
 * we also check for the escaped form.
 */
function restorePlaceholders(
  html: string,
  placeholders: Map<string, string>
): string {
  let result = html;
  for (const [key, value] of placeholders) {
    result = result.split(key).join(value);
  }
  return result;
}

/**
 * Create a configured markdown-it instance.
 *
 * html is disabled to prevent user-authored HTML (e.g. <script>, <img onerror>)
 * from being passed through. Safe MDI-generated HTML (ruby, span) is protected
 * via placeholders and restored after rendering.
 */
function createMarkdownIt(): MarkdownIt {
  return new MarkdownIt({
    html: false,
    breaks: true,
  });
}

/**
 * Get CSS styles for MDI elements.
 *
 * @param options.verticalWriting - Include vertical writing mode styles
 * @returns CSS stylesheet string
 */
export function getMdiStylesheet(options?: {
  verticalWriting?: boolean;
}): string {
  const rules: string[] = [
    ".mdi-tcy { text-combine-upright: all; }",
    ".mdi-nobr { white-space: nowrap; word-break: keep-all; }",
    ".mdi-kern { letter-spacing: var(--mdi-kern, 0em); }",
    "ruby rt { font-size: 0.5em; }",
  ];

  if (options?.verticalWriting) {
    rules.push(
      "body { writing-mode: vertical-rl; text-orientation: mixed; }"
    );
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
 * @returns Complete HTML document string, or body content if bodyOnly is true
 */
export function mdiToHtml(
  markdown: string,
  options?: {
    metadata?: ExportMetadata;
    verticalWriting?: boolean;
    bodyOnly?: boolean;
  }
): string {
  const md = createMarkdownIt();

  // Pre-process MDI syntax into placeholders, render with markdown-it
  // (html:false blocks user-authored HTML), then restore safe MDI HTML
  const { text: preprocessed, placeholders } = preProcessMdiSyntax(markdown);
  const rawHtml = md.render(preprocessed);
  const bodyHtml = restorePlaceholders(rawHtml, placeholders);

  if (options?.bodyOnly) {
    return bodyHtml;
  }

  const lang = options?.metadata?.language ?? "ja";
  const title = options?.metadata?.title ?? "";
  const stylesheet = getMdiStylesheet({
    verticalWriting: options?.verticalWriting,
  });

  // Build <meta> tags for optional metadata
  // Include a strict CSP to block script execution in export output
  const metaTags: string[] = [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self';">`,
  ];

  if (options?.metadata?.author) {
    metaTags.push(`<meta name="author" content="${escapeHtmlAttr(options.metadata.author)}">`);
  }

  if (options?.metadata?.date) {
    metaTags.push(`<meta name="date" content="${escapeHtmlAttr(options.metadata.date)}">`);
  }

  return [
    "<!DOCTYPE html>",
    `<html lang="${escapeHtmlAttr(lang)}">`,
    "<head>",
    ...metaTags.map((tag) => `  ${tag}`),
    `  <title>${escapeHtml(title)}</title>`,
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
 * Split MDI markdown into chapters by top-level headings (# ).
 *
 * Content before the first heading becomes a chapter with an empty title.
 * Each chapter's htmlContent is generated with bodyOnly mode.
 *
 * @param markdown - Full MDI markdown document
 * @returns Array of Chapter objects
 */
export function splitIntoChapters(markdown: string): Chapter[] {
  const chapters: Chapter[] = [];
  const lines = markdown.split("\n");

  let currentTitle = "";
  let currentLevel = 1;
  let currentLines: string[] = [];
  let hasStarted = false;

  for (const line of lines) {
    // Match top-level headings: "# Title"
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);

    if (headingMatch && headingMatch[1] === "#") {
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
      currentLevel = 1;
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
 * Escape a string for use in HTML text content
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
