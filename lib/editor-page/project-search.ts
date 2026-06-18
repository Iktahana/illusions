import {
  createReplacementSteps,
  findSearchMatchesInProjection,
  type SearchMatch,
  type SearchMatchSource,
  type SearchOptions,
  type SearchTextProjection,
} from "./find-search-matches";
import type { VirtualFileSystem } from "@/lib/vfs/types";

export interface RawDocumentSearchMatch extends SearchMatch {
  rawFrom: number;
  rawTo: number;
  lineNumber: number;
}

export interface RawDocumentSearchResult {
  matches: RawDocumentSearchMatch[];
  content: string;
}

export interface ProjectSearchFileResult extends RawDocumentSearchResult {
  path: string;
  fileName: string;
}

export interface SearchProjectFilesParams {
  vfs: VirtualFileSystem;
  searchTerm: string;
  options: SearchOptions;
  rootPath?: string;
  openBuffers?: ReadonlyMap<string, string>;
  signal?: AbortSignal;
  onProgress?: (searchedFiles: number, totalFiles: number) => void;
  onFileResult?: (result: ProjectSearchFileResult) => void;
  onFileError?: (path: string, error: unknown) => void;
  matchDocument?: ProjectDocumentMatcher;
}

export type ProjectDocumentMatcher = (
  content: string,
  fileType: string,
  searchTerm: string,
  options: SearchOptions,
) => RawDocumentSearchResult | Promise<RawDocumentSearchResult>;

export interface ProjectReplacementChange {
  path: string;
  before: string;
  after: string;
  replacementCount: number;
  openBuffer: boolean;
}

interface ReplaceProjectFilesParams {
  vfs: VirtualFileSystem;
  results: readonly ProjectSearchFileResult[];
  replacement: string;
  options: SearchOptions;
  openBuffers?: ReadonlyMap<string, string>;
  onOpenBufferChange?: (path: string, content: string) => void | Promise<void>;
}

interface UndoProjectReplacementParams {
  vfs: VirtualFileSystem;
  changes: readonly ProjectReplacementChange[];
  openBuffers?: ReadonlyMap<string, string>;
  onOpenBufferChange?: (path: string, content: string) => void | Promise<void>;
}

const SEARCHABLE_EXTENSIONS = new Set([".mdi", ".md", ".txt"]);
const PROJECT_SEARCH_YIELD_INTERVAL = 8;
const MDI_TOKEN_RE =
  /<!--[\s\S]*?-->|\{[^{}|\n]+\|[^{}\n]+\}|\^[^^\n]+\^|\[\[(?:blank|br|no-break:[^\]\n]*|kern:[^:\]\n]+:[^\]\n]*)\]\]/g;

export function isSearchableProjectPath(path: string): boolean {
  if (hasHiddenPathSegment(path)) return false;
  const fileName = normalizePath(path).split("/").at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) return false;
  return SEARCHABLE_EXTENSIONS.has(fileName.slice(dotIndex).toLowerCase());
}

export async function searchProjectFiles({
  vfs,
  searchTerm,
  options,
  rootPath = "",
  openBuffers = new Map(),
  signal,
  onProgress,
  onFileResult,
  onFileError,
  matchDocument = findRawDocumentMatches,
}: SearchProjectFilesParams): Promise<ProjectSearchFileResult[]> {
  if (!searchTerm) return [];

  const paths = await collectSearchablePaths(vfs, rootPath, signal);
  const results: ProjectSearchFileResult[] = [];

  for (let index = 0; index < paths.length; index += 1) {
    throwIfAborted(signal);
    const path = paths[index];

    try {
      const content = openBuffers.get(path) ?? (await vfs.readFile(path));
      const fileType = getFileExtension(path);
      const result = await matchDocument(content, fileType, searchTerm, options);
      if (result.matches.length > 0) {
        const fileResult = {
          ...result,
          path,
          fileName: path.split("/").at(-1) ?? path,
        };
        results.push(fileResult);
        onFileResult?.(fileResult);
      }
    } catch (error) {
      onFileError?.(path, error);
    }

    onProgress?.(index + 1, paths.length);
    if ((index + 1) % PROJECT_SEARCH_YIELD_INTERVAL === 0) await yieldToMainThread();
  }

  return results;
}

export function findRawDocumentMatches(
  content: string,
  fileType: string,
  searchTerm: string,
  options: SearchOptions,
): RawDocumentSearchResult {
  if (!searchTerm) return { content, matches: [] };

  const normalizedFileType = fileType.toLowerCase();
  const { body, rubyReadings } =
    normalizedFileType === ".mdi"
      ? createMdiProjections(content, options.excludeComments ?? true)
      : {
          body:
            normalizedFileType === ".md"
              ? createMarkdownProjection(content, options.excludeComments ?? true)
              : createPlainProjection(content),
          rubyReadings: [],
        };
  const target = options.searchTarget ?? "all";
  const matches: SearchMatch[] = [];

  if (target !== "ruby") {
    matches.push(...findSearchMatchesInProjection(body, searchTerm, options));
  }
  if (target !== "body") {
    for (const reading of rubyReadings) {
      matches.push(...findSearchMatchesInProjection(reading, searchTerm, options));
    }
  }

  return {
    content,
    matches: matches
      .map((match) => addRawMatchMetadata(content, match))
      .sort((left, right) => left.rawFrom - right.rawFrom || left.rawTo - right.rawTo),
  };
}

export async function replaceProjectFiles({
  vfs,
  results,
  replacement,
  options,
  openBuffers = new Map(),
  onOpenBufferChange,
}: ReplaceProjectFilesParams): Promise<ProjectReplacementChange[]> {
  const plans: Array<{
    result: ProjectSearchFileResult;
    nextContent: string;
    replacementCount: number;
    openBuffer: boolean;
  }> = [];
  const changes: ProjectReplacementChange[] = [];

  for (const result of results) {
    if (!isSearchableProjectPath(result.path)) continue;
    const steps = createReplacementSteps(result.matches, replacement, options);
    if (steps.length === 0) continue;

    const openBuffer = openBuffers.has(result.path);
    const currentContent = openBuffer
      ? (openBuffers.get(result.path) ?? "")
      : await vfs.readFile(result.path);
    if (currentContent !== result.content) {
      throw new Error(`${result.path} は検索後に内容が変更されました`);
    }

    let nextContent = result.content;
    for (const step of steps) {
      nextContent = nextContent.slice(0, step.from) + step.text + nextContent.slice(step.to);
    }
    plans.push({ result, nextContent, replacementCount: steps.length, openBuffer });
  }

  try {
    for (const plan of plans) {
      const { result, nextContent, replacementCount, openBuffer } = plan;
      if (openBuffer) {
        if (!onOpenBufferChange) {
          throw new Error(`Open buffer update handler is missing for ${result.path}`);
        }
        await onOpenBufferChange(result.path, nextContent);
      } else {
        await vfs.writeFile(result.path, nextContent);
      }

      changes.push({
        path: result.path,
        before: result.content,
        after: nextContent,
        replacementCount,
        openBuffer,
      });
    }
  } catch (error) {
    await restoreProjectChanges(vfs, changes, onOpenBufferChange);
    throw error;
  }

  return changes;
}

export async function undoProjectReplacement({
  vfs,
  changes,
  openBuffers = new Map(),
  onOpenBufferChange,
}: UndoProjectReplacementParams): Promise<void> {
  for (const change of changes) {
    const currentContent = change.openBuffer
      ? openBuffers.get(change.path)
      : await vfs.readFile(change.path);
    if (currentContent !== change.after) {
      throw new Error(`${change.path} は置換後に内容が変更されました`);
    }
  }
  await restoreProjectChanges(vfs, [...changes].reverse(), onOpenBufferChange);
}

async function collectSearchablePaths(
  vfs: VirtualFileSystem,
  rootPath: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (rootPath && hasHiddenPathSegment(rootPath)) return [];
  const paths: string[] = [];

  async function visit(directoryPath: string): Promise<void> {
    throwIfAborted(signal);
    const entries = [...(await vfs.listDirectory(directoryPath))].sort((left, right) =>
      left.path.localeCompare(right.path),
    );

    for (const entry of entries) {
      throwIfAborted(signal);
      if (hasHiddenPathSegment(entry.path)) continue;
      if (entry.kind === "directory") {
        await visit(entry.path);
      } else if (isSearchableProjectPath(entry.path)) {
        paths.push(entry.path);
      }
    }
  }

  await visit(rootPath);
  return paths;
}

function createPlainProjection(content: string): SearchTextProjection {
  return {
    text: content,
    segments: content
      ? [
          {
            text: content,
            displayFrom: 0,
            displayTo: content.length,
            from: 0,
            to: content.length,
            source: "text",
            replaceable: true,
          },
        ]
      : [],
  };
}

function createMarkdownProjection(
  content: string,
  excludeComments: boolean,
): SearchTextProjection {
  const projection: SearchTextProjection = { text: "", segments: [] };
  const commentPattern = /<!--[\s\S]*?-->/g;
  let cursor = 0;

  for (const match of content.matchAll(commentPattern)) {
    const rawFrom = match.index;
    if (rawFrom > cursor) {
      appendProjectionSegment(
        projection,
        content.slice(cursor, rawFrom),
        cursor,
        rawFrom,
        "text",
        true,
      );
    }
    if (!excludeComments) {
      appendProjectionSegment(
        projection,
        match[0].replace(/^<!--\s*|\s*-->$/g, ""),
        rawFrom,
        rawFrom + match[0].length,
        "comment",
        false,
      );
    }
    cursor = rawFrom + match[0].length;
  }

  if (cursor < content.length) {
    appendProjectionSegment(
      projection,
      content.slice(cursor),
      cursor,
      content.length,
      "text",
      true,
    );
  }

  return projection;
}

function createMdiProjections(
  content: string,
  excludeComments: boolean,
): {
  body: SearchTextProjection;
  rubyReadings: SearchTextProjection[];
} {
  const body: SearchTextProjection = { text: "", segments: [] };
  const rubyReadings: SearchTextProjection[] = [];
  let cursor = 0;

  MDI_TOKEN_RE.lastIndex = 0;
  for (const tokenMatch of content.matchAll(MDI_TOKEN_RE)) {
    const rawFrom = tokenMatch.index;
    const token = tokenMatch[0];
    if (rawFrom > cursor) {
      appendProjectionSegment(body, content.slice(cursor, rawFrom), cursor, rawFrom, "text", true);
    }

    appendMdiToken(
      body,
      rubyReadings,
      token,
      rawFrom,
      rawFrom + token.length,
      excludeComments,
    );
    cursor = rawFrom + token.length;
  }

  if (cursor < content.length) {
    appendProjectionSegment(body, content.slice(cursor), cursor, content.length, "text", true);
  }

  return { body, rubyReadings };
}

function appendMdiToken(
  body: SearchTextProjection,
  rubyReadings: SearchTextProjection[],
  token: string,
  rawFrom: number,
  rawTo: number,
  excludeComments: boolean,
): void {
  if (token.startsWith("<!--")) {
    if (!excludeComments) {
      appendProjectionSegment(
        body,
        token.replace(/^<!--\s*|\s*-->$/g, ""),
        rawFrom,
        rawTo,
        "comment",
        false,
      );
    }
    return;
  }

  const ruby = /^\{([^{}|\n]+)\|([^{}\n]+)\}$/.exec(token);
  if (ruby) {
    appendProjectionSegment(body, ruby[1], rawFrom, rawTo, "ruby-base", false);
    const reading: SearchTextProjection = { text: "", segments: [] };
    appendProjectionSegment(
      reading,
      ruby[2].replace(/\./g, ""),
      rawFrom,
      rawTo,
      "ruby-text",
      false,
    );
    rubyReadings.push(reading);
    return;
  }

  const tcy = /^\^([^^\n]+)\^$/.exec(token);
  if (tcy) {
    appendProjectionSegment(body, tcy[1], rawFrom, rawTo, "tcy", false);
    return;
  }

  const noBreak = /^\[\[no-break:([^\]\n]*)\]\]$/.exec(token);
  if (noBreak) {
    appendProjectionSegment(body, noBreak[1], rawFrom, rawTo, "nobreak", false);
    return;
  }

  const kern = /^\[\[kern:[^:\]\n]+:([^\]\n]*)\]\]$/.exec(token);
  if (kern) {
    appendProjectionSegment(body, kern[1], rawFrom, rawTo, "kern", false);
    return;
  }

  if (token === "[[blank]]" || token === "[[br]]") {
    appendProjectionSegment(body, "\n", rawFrom, rawTo, "mdibreak", false);
  }
}

function appendProjectionSegment(
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

function addRawMatchMetadata(content: string, match: SearchMatch): RawDocumentSearchMatch {
  const rawFrom = match.from;
  const rawTo = match.to;
  const before = content.slice(0, rawFrom);
  const lineNumber = before.split("\n").length;
  const heading = findPreviousHeading(before);

  return {
    ...match,
    rawFrom,
    rawTo,
    lineNumber,
    paragraphNumber: lineNumber,
    heading,
  };
}

function findPreviousHeading(content: string): string | undefined {
  const lines = content.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(lines[index]);
    if (heading) return heading[1];
  }
  return undefined;
}

function hasHiddenPathSegment(path: string): boolean {
  return normalizePath(path)
    .split("/")
    .filter(Boolean)
    .some((segment) => segment.startsWith("."));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function getFileExtension(path: string): string {
  const fileName = normalizePath(path).split("/").at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("Project search was cancelled", "AbortError");
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function restoreProjectChanges(
  vfs: VirtualFileSystem,
  changes: readonly ProjectReplacementChange[],
  onOpenBufferChange?: (path: string, content: string) => void | Promise<void>,
): Promise<void> {
  for (const change of changes) {
    if (change.openBuffer) {
      if (!onOpenBufferChange) {
        throw new Error(`Open buffer update handler is missing for ${change.path}`);
      }
      await onOpenBufferChange(change.path, change.before);
    } else {
      await vfs.writeFile(change.path, change.before);
    }
  }
}
