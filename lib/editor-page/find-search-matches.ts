import type { Node } from "@milkdown/prose/model";

import { normalizeJapaneseSearchVariants } from "./japanese-variant-normalization";

export type SearchMatchSource =
  | "text"
  | "ruby-base"
  | "ruby-text"
  | "tcy"
  | "nobreak"
  | "kern"
  | "hardbreak"
  | "mdibreak"
  | "comment"
  | "mixed";

export type SearchTarget = "all" | "body" | "ruby";

export interface SearchRange {
  from: number;
  to: number;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
  normalizeVariants?: boolean;
  excludeComments?: boolean;
  searchTarget?: SearchTarget;
  range?: SearchRange;
}

export interface SearchMatch {
  from: number;
  to: number;
  text?: string;
  source?: SearchMatchSource;
  replaceable?: boolean;
  captures?: string[];
  heading?: string;
  paragraphNumber?: number;
}

export interface ReplacementStep {
  from: number;
  to: number;
  text: string;
}

type ResolvedSearchOptions = Required<Omit<SearchOptions, "range">> & {
  range?: SearchRange;
};

export interface SearchTextSegment {
  text: string;
  displayFrom: number;
  displayTo: number;
  from: number;
  to: number;
  source: SearchMatchSource;
  replaceable: boolean;
}

export interface SearchTextProjection {
  text: string;
  segments: SearchTextSegment[];
}

interface NormalizedProjection {
  text: string;
  sourceFrom: number[];
  sourceTo: number[];
}

interface RawMatch {
  from: number;
  to: number;
  captures?: string[];
}

const DEFAULT_OPTIONS: ResolvedSearchOptions = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  normalizeVariants: false,
  excludeComments: true,
  searchTarget: "all",
};

const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;
const JAPANESE_GRAPHEME_SEGMENTER = new Intl.Segmenter("ja", { granularity: "grapheme" });

/**
 * Search displayed editor text while retaining exact ProseMirror positions.
 * MDI syntax is represented by atom nodes and is never exposed as raw markup.
 */
export function findSearchMatches(
  doc: Node,
  searchTerm: string,
  caseSensitiveOrOptions: boolean | SearchOptions,
): SearchMatch[] {
  if (!searchTerm) return [];

  const options = resolveOptions(caseSensitiveOrOptions);
  if (options.regex && !compilePattern(searchTerm, options)) return [];

  const matches: SearchMatch[] = [];
  let currentHeading: string | undefined;
  let paragraphNumber = 0;

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;

    const isHeading = node.type.name === "heading";
    if (!isHeading) paragraphNumber += 1;

    const bodyProjection = createBodyProjection(node, pos + 1, options.excludeComments);
    const metadata = {
      heading: isHeading ? bodyProjection.text || currentHeading : currentHeading,
      paragraphNumber: isHeading ? undefined : paragraphNumber,
    };

    if (options.searchTarget !== "ruby") {
      matches.push(...searchProjection(bodyProjection, searchTerm, options, metadata));
    }

    if (options.searchTarget !== "body") {
      for (const rubyProjection of createRubyReadingProjections(node, pos + 1)) {
        matches.push(...searchProjection(rubyProjection, searchTerm, options, metadata));
      }
    }

    if (isHeading && bodyProjection.text) currentHeading = bodyProjection.text;
    return false;
  });

  return matches.sort((left, right) => left.from - right.from || left.to - right.to);
}

export function getSearchPatternError(
  searchTerm: string,
  caseSensitiveOrOptions: boolean | SearchOptions,
): string | null {
  if (!searchTerm) return null;
  const options = resolveOptions(caseSensitiveOrOptions);
  if (!options.regex) return null;
  return compilePattern(searchTerm, options) ? null : "正規表現が正しくありません";
}

export function findSearchMatchesInProjection(
  projection: SearchTextProjection,
  searchTerm: string,
  caseSensitiveOrOptions: boolean | SearchOptions,
  metadata: Pick<SearchMatch, "heading" | "paragraphNumber"> = {},
): SearchMatch[] {
  if (!searchTerm) return [];
  return searchProjection(projection, searchTerm, resolveOptions(caseSensitiveOrOptions), metadata);
}

export function isSearchMatchReplaceable(match: SearchMatch): boolean {
  return match.replaceable !== false && match.from < match.to;
}

export function buildReplacementText(
  match: SearchMatch,
  replacement: string,
  caseSensitiveOrOptions: boolean | SearchOptions,
): string {
  if (!resolveOptions(caseSensitiveOrOptions).regex) return replacement;

  return replacement.replace(/\$(\$|&|[1-9][0-9]?)/g, (token, reference: string) => {
    if (reference === "$") return "$";
    if (reference === "&") return match.text ?? "";

    const captureIndex = Number(reference) - 1;
    if (!match.captures || captureIndex < 0 || captureIndex >= match.captures.length) return token;
    return match.captures[captureIndex] ?? "";
  });
}

export function createReplacementSteps(
  matches: readonly SearchMatch[],
  replacement: string,
  caseSensitiveOrOptions: boolean | SearchOptions,
): ReplacementStep[] {
  const seen = new Set<string>();

  return matches
    .filter(isSearchMatchReplaceable)
    .map((match) => ({
      from: match.from,
      to: match.to,
      text: buildReplacementText(match, replacement, caseSensitiveOrOptions),
    }))
    .filter((step) => {
      const key = `${step.from}:${step.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.from - left.from || right.to - left.to);
}

function resolveOptions(value: boolean | SearchOptions): ResolvedSearchOptions {
  if (typeof value === "boolean") return { ...DEFAULT_OPTIONS, caseSensitive: value };
  return { ...DEFAULT_OPTIONS, ...value };
}

function createBodyProjection(
  block: Node,
  blockContentStart: number,
  excludeComments: boolean,
): SearchTextProjection {
  const projection: SearchTextProjection = { text: "", segments: [] };

  block.forEach((child, offset) => {
    const from = blockContentStart + offset;
    if (child.isText && child.text) {
      appendSegment(projection, child.text, from, from + child.nodeSize, "text", true);
      return;
    }

    const comment = getCommentText(child);
    if (comment !== null) {
      if (!excludeComments) {
        appendSegment(projection, comment, from, from + child.nodeSize, "comment", false);
      }
      return;
    }

    const atom = getDisplayedAtomText(child);
    if (atom) {
      appendSegment(projection, atom.text, from, from + child.nodeSize, atom.source, false);
    }
  });

  return projection;
}

function getCommentText(node: Node): string | null {
  if (node.type.name !== "comment" && node.type.name !== "htmlComment") return null;
  const value = node.attrs.value ?? node.attrs.text ?? node.textContent;
  return typeof value === "string" ? value.replace(/^<!--\s*|\s*-->$/g, "") : "";
}

function createRubyReadingProjections(
  block: Node,
  blockContentStart: number,
): SearchTextProjection[] {
  const projections: SearchTextProjection[] = [];

  block.forEach((child, offset) => {
    if (child.type.name !== "ruby") return;
    const text = ((child.attrs.text as string) ?? "").replace(/\./g, "");
    if (!text) return;

    const from = blockContentStart + offset;
    const projection: SearchTextProjection = { text: "", segments: [] };
    appendSegment(projection, text, from, from + child.nodeSize, "ruby-text", false);
    projections.push(projection);
  });

  return projections;
}

function appendSegment(
  projection: SearchTextProjection,
  text: string,
  from: number,
  to: number,
  source: SearchMatchSource,
  replaceable: boolean,
): void {
  if (!text) return;
  const displayFrom = projection.text.length;
  projection.text += text;
  projection.segments.push({
    text,
    displayFrom,
    displayTo: projection.text.length,
    from,
    to,
    source,
    replaceable,
  });
}

function getDisplayedAtomText(node: Node): { text: string; source: SearchMatchSource } | null {
  switch (node.type.name) {
    case "ruby":
      return { text: (node.attrs.base as string) ?? "", source: "ruby-base" };
    case "tcy":
      return { text: (node.attrs.value as string) ?? "", source: "tcy" };
    case "nobreak":
      return { text: (node.attrs.text as string) ?? "", source: "nobreak" };
    case "kern":
      return { text: (node.attrs.text as string) ?? "", source: "kern" };
    case "hardbreak":
      return { text: "\n", source: "hardbreak" };
    case "mdibreak":
      return { text: "\n", source: "mdibreak" };
    default:
      return null;
  }
}

function searchProjection(
  projection: SearchTextProjection,
  searchTerm: string,
  options: ResolvedSearchOptions,
  metadata: Pick<SearchMatch, "heading" | "paragraphNumber">,
): SearchMatch[] {
  if (!projection.text || projection.segments.length === 0) return [];

  const normalized = normalizeProjection(projection.text, options.normalizeVariants);
  const normalizedTerm = options.normalizeVariants
    ? normalizeJapaneseSearchVariants(searchTerm)
    : searchTerm;
  const pattern = compilePattern(normalizedTerm, options);
  if (!pattern) return [];

  const rawMatches = executePattern(normalized.text, normalizedTerm, pattern, options);
  const matches: SearchMatch[] = [];

  for (const rawMatch of rawMatches) {
    const sourceFrom = normalized.sourceFrom[rawMatch.from];
    const sourceTo = normalized.sourceTo[rawMatch.to - 1];
    if (sourceFrom === undefined || sourceTo === undefined) continue;

    const match = mapProjectionMatch(projection, sourceFrom, sourceTo, rawMatch.captures);
    if (!match) continue;
    if (options.range && (match.from < options.range.from || match.to > options.range.to)) continue;
    matches.push({ ...match, ...metadata });
  }

  return matches;
}

function compilePattern(searchTerm: string, options: ResolvedSearchOptions): RegExp | null {
  try {
    const source = options.regex ? searchTerm : escapeRegExp(searchTerm);
    return new RegExp(source, options.caseSensitive ? "gu" : "giu");
  } catch {
    return null;
  }
}

function executePattern(
  text: string,
  searchTerm: string,
  pattern: RegExp,
  options: ResolvedSearchOptions,
): RawMatch[] {
  if (!searchTerm) return [];
  const matches: RawMatch[] = [];
  pattern.lastIndex = 0;

  while (pattern.lastIndex <= text.length) {
    const match = pattern.exec(text);
    if (!match) break;

    const matchedText = match[0] ?? "";
    if (!matchedText) {
      pattern.lastIndex = advanceCodePoint(text, match.index);
      continue;
    }

    const to = match.index + matchedText.length;
    if (!options.wholeWord || hasWordBoundaries(text, match.index, to)) {
      matches.push({
        from: match.index,
        to,
        captures: match.slice(1).map((capture) => capture ?? ""),
      });
    }
  }

  return matches;
}

function mapProjectionMatch(
  projection: SearchTextProjection,
  displayFrom: number,
  displayTo: number,
  captures: string[] | undefined,
): SearchMatch | null {
  const segments = projection.segments.filter(
    (segment) => segment.displayFrom < displayTo && segment.displayTo > displayFrom,
  );
  const first = segments[0];
  const last = segments.at(-1);
  if (!first || !last) return null;

  const from = first.replaceable
    ? first.from + Math.max(0, displayFrom - first.displayFrom)
    : first.from;
  const to = last.replaceable
    ? last.from + Math.min(last.text.length, displayTo - last.displayFrom)
    : last.to;
  const sources = new Set(segments.map((segment) => segment.source));

  return {
    from,
    to,
    text: projection.text.slice(displayFrom, displayTo),
    source: sources.size === 1 ? first.source : "mixed",
    replaceable: segments.every((segment) => segment.replaceable) && from < to,
    captures,
  };
}

function normalizeProjection(text: string, normalizeVariants: boolean): NormalizedProjection {
  const projection: NormalizedProjection = { text: "", sourceFrom: [], sourceTo: [] };

  for (const { segment, index: sourceIndex } of JAPANESE_GRAPHEME_SEGMENTER.segment(text)) {
    const normalizedSegment = normalizeVariants
      ? normalizeJapaneseSearchVariants(segment)
      : segment;
    projection.text += normalizedSegment;
    for (let index = 0; index < normalizedSegment.length; index += 1) {
      projection.sourceFrom.push(sourceIndex);
      projection.sourceTo.push(sourceIndex + segment.length);
    }
  }

  return projection;
}

function hasWordBoundaries(text: string, from: number, to: number): boolean {
  return !isWordCharacter(codePointBefore(text, from)) && !isWordCharacter(codePointAt(text, to));
}

function isWordCharacter(value: string): boolean {
  return value !== "" && WORD_CHAR_RE.test(value);
}

function codePointBefore(text: string, index: number): string {
  return Array.from(text.slice(0, index)).at(-1) ?? "";
}

function codePointAt(text: string, index: number): string {
  return Array.from(text.slice(index))[0] ?? "";
}

function advanceCodePoint(text: string, index: number): number {
  if (index >= text.length) return text.length + 1;
  const codePoint = text.codePointAt(index);
  return index + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
