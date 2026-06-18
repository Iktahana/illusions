"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  History,
  Replace,
  ReplaceAll,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { EditorView } from "@milkdown/prose/view";
import clsx from "clsx";

import {
  buildReplacementText,
  createReplacementSteps,
  getSearchPatternError,
  isSearchMatchReplaceable,
  type SearchMatch,
  type SearchOptions,
  type SearchTarget,
} from "@/lib/editor-page/find-search-matches";
import {
  replaceProjectFiles,
  searchProjectFiles,
  undoProjectReplacement,
  type ProjectReplacementChange,
  type ProjectSearchFileResult,
} from "@/lib/editor-page/project-search";
import { ProjectSearchWorkerClient } from "@/lib/editor-page/project-search-worker-client";
import { addSearchHistoryEntry, loadSearchHistory } from "@/lib/editor-page/search-history";
import { isEditorViewAlive } from "@/lib/editor-page/use-search-highlight";

type SearchScope = "project" | "current" | "folder";
const EMPTY_PROJECT_BUFFERS: ReadonlyMap<string, string> = new Map();

interface SearchResultsProps {
  editorView: EditorView | null;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (value: boolean) => void;
  regexSearch?: boolean;
  onRegexSearchChange?: (value: boolean) => void;
  wholeWordSearch?: boolean;
  onWholeWordSearchChange?: (value: boolean) => void;
  normalizeVariants?: boolean;
  onNormalizeVariantsChange?: (value: boolean) => void;
  excludeComments?: boolean;
  onExcludeCommentsChange?: (value: boolean) => void;
  searchTarget?: SearchTarget;
  onSearchTargetChange?: (value: SearchTarget) => void;
  selectionOnly?: boolean;
  onSelectionOnlyChange?: (value: boolean) => void;
  hasSelection?: boolean;
  matches: SearchMatch[];
  currentMatchIndex: number;
  onCurrentMatchIndexChange: (index: number) => void;
  onClose: () => void;
  projectSearchEnabled?: boolean;
  projectOpenBuffers?: ReadonlyMap<string, string>;
  currentFilePath?: string;
  onOpenProjectFile?: (path: string) => Promise<void>;
  onProjectBufferChange?: (path: string, content: string) => void | Promise<void>;
}

interface MatchGroup {
  heading: string;
  matches: Array<{ match: SearchMatch; index: number }>;
}

export default function SearchResults({
  editorView,
  searchTerm,
  onSearchTermChange,
  caseSensitive,
  onCaseSensitiveChange,
  regexSearch = false,
  onRegexSearchChange = () => {},
  wholeWordSearch = false,
  onWholeWordSearchChange = () => {},
  normalizeVariants = false,
  onNormalizeVariantsChange = () => {},
  excludeComments = true,
  onExcludeCommentsChange = () => {},
  searchTarget = "all",
  onSearchTargetChange = () => {},
  selectionOnly = false,
  onSelectionOnlyChange = () => {},
  hasSelection = false,
  matches,
  currentMatchIndex,
  onCurrentMatchIndexChange,
  onClose,
  projectSearchEnabled = false,
  projectOpenBuffers = EMPTY_PROJECT_BUFFERS,
  currentFilePath,
  onOpenProjectFile,
  onProjectBufferChange,
}: SearchResultsProps) {
  const [replaceTerm, setReplaceTerm] = useState("");
  const [replaceTouched, setReplaceTouched] = useState(false);
  const [showReplace, setShowReplace] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [scope, setScope] = useState<SearchScope>(projectSearchEnabled ? "project" : "current");
  const [folderPath, setFolderPath] = useState("");
  const [projectResults, setProjectResults] = useState<ProjectSearchFileResult[]>([]);
  const [projectNavigationIndex, setProjectNavigationIndex] = useState(0);
  const [projectSearchPending, setProjectSearchPending] = useState(false);
  const [projectProgress, setProjectProgress] = useState({ searched: 0, total: 0 });
  const [projectSearchError, setProjectSearchError] = useState<string | null>(null);
  const [confirmReplaceAll, setConfirmReplaceAll] = useState(false);
  const [projectRefreshToken, setProjectRefreshToken] = useState(0);
  const [replacementPending, setReplacementPending] = useState(false);
  const [lastProjectReplacement, setLastProjectReplacement] = useState<ProjectReplacementChange[]>(
    [],
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setHistory(loadSearchHistory()), []);

  const searchOptions = useMemo<SearchOptions>(
    () => ({
      caseSensitive,
      regex: regexSearch,
      wholeWord: wholeWordSearch,
      normalizeVariants,
      excludeComments,
      searchTarget,
    }),
    [caseSensitive, excludeComments, normalizeVariants, regexSearch, searchTarget, wholeWordSearch],
  );
  const patternError = getSearchPatternError(searchTerm, searchOptions);

  useEffect(() => {
    if (!projectSearchEnabled && scope !== "current") setScope("current");
    if (scope !== "current" && selectionOnly) onSelectionOnlyChange(false);
  }, [onSelectionOnlyChange, projectSearchEnabled, scope, selectionOnly]);

  useEffect(() => {
    if (scope === "current" || !projectSearchEnabled || !searchTerm || patternError) {
      setProjectResults([]);
      setProjectNavigationIndex(0);
      setProjectSearchPending(false);
      setProjectSearchError(null);
      return;
    }

    const controller = new AbortController();
    let workerClient: ProjectSearchWorkerClient | null = null;
    const timer = window.setTimeout(() => {
      const activeWorkerClient = new ProjectSearchWorkerClient();
      workerClient = activeWorkerClient;
      setProjectSearchPending(true);
      setProjectResults([]);
      setProjectNavigationIndex(0);
      setProjectProgress({ searched: 0, total: 0 });
      setProjectSearchError(null);

      void import("@/lib/services/project-file-service")
        .then(({ getProjectFileService }) => {
          const vfs = getProjectFileService();
          if (!vfs.isRootOpen()) throw new Error("プロジェクトを開いてください");
          return searchProjectFiles({
            vfs,
            searchTerm,
            options: searchOptions,
            rootPath: scope === "folder" ? folderPath.trim() : "",
            openBuffers: projectOpenBuffers,
            signal: controller.signal,
            matchDocument: activeWorkerClient.matchDocument,
            onFileResult: (result) => {
              if (!controller.signal.aborted) {
                setProjectResults((current) => [...current, result]);
              }
            },
            onProgress: (searched, total) => {
              if (!controller.signal.aborted) setProjectProgress({ searched, total });
            },
            onFileError: (path, error) => {
              if (controller.signal.aborted) return;
              const message = error instanceof Error ? error.message : String(error);
              setProjectSearchError(`${path}: ${message}`);
            },
          });
        })
        .then((results) => {
          if (!controller.signal.aborted) setProjectResults(results);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setProjectSearchError(error instanceof Error ? error.message : "検索に失敗しました");
          setProjectResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setProjectSearchPending(false);
        });
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      workerClient?.dispose();
    };
  }, [
    folderPath,
    patternError,
    projectOpenBuffers,
    projectRefreshToken,
    projectSearchEnabled,
    scope,
    searchOptions,
    searchTerm,
  ]);

  const commitSearchHistory = useCallback(() => {
    setHistory(addSearchHistoryEntry(searchTerm));
  }, [searchTerm]);

  const getMatchContext = useCallback(
    (match: SearchMatch): { before: string; text: string; after: string } => {
      if (!editorView) return { before: "", text: match.text ?? "", after: "" };

      const { doc } = editorView.state;
      const contextLength = 30;
      const beforeStart = Math.max(0, match.from - contextLength);
      const afterEnd = Math.min(doc.content.size, match.to + contextLength);
      const beforeText = doc.textBetween(beforeStart, match.from);
      const afterText = doc.textBetween(match.to, afterEnd);

      return {
        before:
          beforeText.length > contextLength ? `...${beforeText.slice(-contextLength)}` : beforeText,
        text: match.text ?? doc.textBetween(match.from, match.to),
        after:
          afterText.length > contextLength ? `${afterText.slice(0, contextLength)}...` : afterText,
      };
    },
    [editorView],
  );

  const goToMatch = useCallback(
    (index: number) => {
      if (!isEditorViewAlive(editorView)) return;
      onCurrentMatchIndexChange(index);
      editorView.focus();
    },
    [editorView, onCurrentMatchIndexChange],
  );

  const navigateCurrentMatches = useCallback(
    (delta: number) => {
      if (matches.length === 0) return;
      const index = (currentMatchIndex + delta + matches.length) % matches.length;
      onCurrentMatchIndexChange(index);
      if (isEditorViewAlive(editorView)) editorView.focus();
    },
    [currentMatchIndex, editorView, matches.length, onCurrentMatchIndexChange],
  );

  const replaceMatch = useCallback(
    (match: SearchMatch) => {
      if (!isEditorViewAlive(editorView) || !isSearchMatchReplaceable(match)) return;
      const [step] = createReplacementSteps([match], replaceTerm, searchOptions);
      if (!step) return;

      const { state, dispatch } = editorView;
      const tr = step.text
        ? state.tr.replaceWith(step.from, step.to, state.schema.text(step.text))
        : state.tr.delete(step.from, step.to);
      dispatch(tr);
    },
    [editorView, replaceTerm, searchOptions],
  );

  const replaceAllCurrentMatches = useCallback(() => {
    if (!isEditorViewAlive(editorView)) return;
    const steps = createReplacementSteps(matches, replaceTerm, searchOptions);
    if (steps.length === 0) return;

    const { state, dispatch } = editorView;
    let tr = state.tr;
    for (const step of steps) {
      tr = step.text
        ? tr.replaceWith(step.from, step.to, state.schema.text(step.text))
        : tr.delete(step.from, step.to);
    }
    dispatch(tr);
    setConfirmReplaceAll(false);
  }, [editorView, matches, replaceTerm, searchOptions]);

  const replaceProjectResults = useCallback(
    async (results: readonly ProjectSearchFileResult[]) => {
      if (!onProjectBufferChange) return;
      setReplacementPending(true);
      setProjectSearchError(null);

      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const changes = await replaceProjectFiles({
          vfs: getProjectFileService(),
          results,
          replacement: replaceTerm,
          options: searchOptions,
          openBuffers: projectOpenBuffers,
          onOpenBufferChange: onProjectBufferChange,
        });
        setLastProjectReplacement(changes);
        setConfirmReplaceAll(false);
        setProjectRefreshToken((token) => token + 1);
      } catch (error) {
        setProjectSearchError(error instanceof Error ? error.message : "置換に失敗しました");
      } finally {
        setReplacementPending(false);
      }
    },
    [onProjectBufferChange, projectOpenBuffers, replaceTerm, searchOptions],
  );

  const undoLastProjectReplacement = useCallback(async () => {
    if (lastProjectReplacement.length === 0 || !onProjectBufferChange) return;
    setReplacementPending(true);
    setProjectSearchError(null);

    try {
      const { getProjectFileService } = await import("@/lib/services/project-file-service");
      await undoProjectReplacement({
        vfs: getProjectFileService(),
        changes: lastProjectReplacement,
        openBuffers: projectOpenBuffers,
        onOpenBufferChange: onProjectBufferChange,
      });
      setLastProjectReplacement([]);
      setProjectRefreshToken((token) => token + 1);
    } catch (error) {
      setProjectSearchError(error instanceof Error ? error.message : "取り消しに失敗しました");
    } finally {
      setReplacementPending(false);
    }
  }, [lastProjectReplacement, onProjectBufferChange, projectOpenBuffers]);

  const currentGroups = useMemo(() => groupMatches(matches), [matches]);
  const projectMatchCount = useMemo(
    () => projectResults.reduce((total, file) => total + file.matches.length, 0),
    [projectResults],
  );
  const projectMatchLocations = useMemo(
    () =>
      projectResults.flatMap((file) =>
        file.matches.map((_match, matchIndex) => ({ file, matchIndex })),
      ),
    [projectResults],
  );
  const navigateMatches = useCallback(
    (delta: number) => {
      if (scope === "current") {
        navigateCurrentMatches(delta);
        return;
      }
      if (projectMatchLocations.length === 0 || !onOpenProjectFile) return;

      const nextIndex =
        (projectNavigationIndex + delta + projectMatchLocations.length) %
        projectMatchLocations.length;
      const location = projectMatchLocations[nextIndex];
      setProjectNavigationIndex(nextIndex);
      void onOpenProjectFile(location.file.path).then(() => {
        onCurrentMatchIndexChange(location.matchIndex);
      });
    },
    [
      navigateCurrentMatches,
      onCurrentMatchIndexChange,
      onOpenProjectFile,
      projectMatchLocations,
      projectNavigationIndex,
      scope,
    ],
  );
  const visibleMatchCount = scope === "current" ? matches.length : projectMatchCount;
  const replaceableMatchCount =
    scope === "current"
      ? matches.filter(isSearchMatchReplaceable).length
      : projectResults.reduce(
          (total, file) => total + file.matches.filter(isSearchMatchReplaceable).length,
          0,
        );

  const renderMatchText = (match: SearchMatch) => {
    const context = getMatchContext(match);
    const replacementPreview = buildReplacementText(match, replaceTerm, searchOptions);
    return (
      <p className="text-sm text-foreground break-words">
        <span className="text-foreground-secondary">{context.before}</span>
        {showReplace && replaceTouched ? (
          <>
            <span
              className="line-through bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-1 rounded"
              data-testid="replace-preview-old"
            >
              {context.text}
            </span>
            <span
              className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-semibold px-1 rounded ml-0.5"
              data-testid="replace-preview-new"
            >
              {replacementPreview || "（削除）"}
            </span>
          </>
        ) : (
          <span className="bg-accent-light text-accent font-semibold px-1 rounded">
            {context.text}
          </span>
        )}
        <span className="text-foreground-secondary">{context.after}</span>
      </p>
    );
  };

  return (
    <div className="h-full bg-background-secondary border-r border-border flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-foreground-secondary" />
          <h2 className="text-lg font-semibold text-foreground">検索</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-hover transition-colors"
          title="検索を閉じる"
        >
          <X className="w-4 h-4 text-foreground-secondary" />
        </button>
      </div>

      <div className="p-4 border-b border-border space-y-3">
        <div className="flex gap-1">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            onBlur={commitSearchHistory}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitSearchHistory();
            }}
            placeholder="検索..."
            aria-invalid={Boolean(patternError)}
            className="min-w-0 flex-1 px-3 py-2 border border-border-secondary bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
          {history.length > 0 && (
            <div className="relative">
              <History className="pointer-events-none absolute left-2 top-2.5 w-4 h-4 text-foreground-tertiary" />
              <select
                aria-label="検索履歴"
                value=""
                onChange={(event) => onSearchTermChange(event.target.value)}
                className="h-full w-9 pl-8 border border-border-secondary bg-background text-transparent rounded appearance-none cursor-pointer"
                title="検索履歴"
              >
                <option value="">検索履歴</option>
                {history.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {patternError && (
          <p className="flex items-center gap-1 text-xs text-danger" role="alert">
            <AlertTriangle className="w-3.5 h-3.5" />
            {patternError}
          </p>
        )}

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs text-foreground-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => onCaseSensitiveChange(event.target.checked)}
              className="rounded"
            />
            大文字小文字を区別
          </label>
          <div className="flex items-center justify-end gap-1">
            {visibleMatchCount > 0 && (
              <span className="text-xs text-foreground-secondary whitespace-nowrap">
                {visibleMatchCount}件見つかりました
              </span>
            )}
            <button
              type="button"
              aria-label="前の一致"
              title="前の一致"
              disabled={visibleMatchCount === 0}
              onClick={() => navigateMatches(-1)}
              className="p-1 rounded hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="次の一致"
              title="次の一致"
              disabled={visibleMatchCount === 0}
              onClick={() => navigateMatches(1)}
              className="p-1 rounded hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowAdvanced((visible) => !visible)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-foreground-secondary hover:bg-hover rounded transition-colors"
          aria-expanded={showAdvanced}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            詳細オプション
          </span>
          {showAdvanced ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {showAdvanced && (
          <div className="space-y-2 pl-2 text-xs text-foreground-secondary">
            <OptionCheckbox
              label="正規表現を使う"
              checked={regexSearch}
              onChange={onRegexSearchChange}
            />
            <OptionCheckbox
              label="単語単位で一致"
              checked={wholeWordSearch}
              onChange={onWholeWordSearchChange}
            />
            <OptionCheckbox
              label="表記ゆれを吸収"
              checked={normalizeVariants}
              onChange={onNormalizeVariantsChange}
            />
            <OptionCheckbox
              label="コメントを除外"
              checked={excludeComments}
              onChange={onExcludeCommentsChange}
            />
            <label className="flex items-center justify-between gap-2">
              検索対象
              <select
                value={searchTarget}
                onChange={(event) => onSearchTargetChange(event.target.value as SearchTarget)}
                className="px-2 py-1 border border-border-secondary bg-background text-foreground rounded"
              >
                <option value="all">本文とルビ</option>
                <option value="body">本文のみ</option>
                <option value="ruby">ルビのみ</option>
              </select>
            </label>
            <OptionCheckbox
              label="選択範囲のみ"
              checked={selectionOnly}
              onChange={onSelectionOnlyChange}
              disabled={!hasSelection || scope !== "current"}
            />
            {projectSearchEnabled && (
              <label className="flex items-center justify-between gap-2">
                範囲
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value as SearchScope)}
                  className="px-2 py-1 border border-border-secondary bg-background text-foreground rounded"
                >
                  <option value="project">プロジェクト全体</option>
                  <option value="current">現在のファイル</option>
                  <option value="folder">フォルダ</option>
                </select>
              </label>
            )}
            {scope === "folder" && projectSearchEnabled && (
              <input
                value={folderPath}
                onChange={(event) => setFolderPath(event.target.value)}
                placeholder="フォルダのパス"
                className="w-full px-2 py-1.5 border border-border-secondary bg-background text-foreground rounded"
              />
            )}
          </div>
        )}

        <button
          onClick={() => setShowReplace((visible) => !visible)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-foreground-secondary hover:bg-hover rounded transition-colors"
          aria-expanded={showReplace}
        >
          <span className="flex items-center gap-2">
            <Replace className="w-4 h-4" />
            置換
          </span>
          {showReplace ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showReplace && (
          <div className="space-y-2 pl-6">
            <input
              type="text"
              value={replaceTerm}
              onFocus={() => setReplaceTouched(true)}
              onChange={(event) => {
                setReplaceTouched(true);
                setReplaceTerm(event.target.value);
              }}
              placeholder="置換後..."
              className="w-full px-3 py-2 border border-border-secondary bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
            />
            <button
              onClick={() => setConfirmReplaceAll(true)}
              disabled={replaceableMatchCount === 0 || !replaceTouched || replacementPending}
              className={clsx(
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors",
                replaceableMatchCount === 0 || !replaceTouched || replacementPending
                  ? "bg-background-tertiary text-foreground-muted cursor-not-allowed"
                  : "bg-accent text-accent-foreground hover:bg-accent-hover",
              )}
            >
              <ReplaceAll className="w-4 h-4" />
              すべて置換
            </button>
            {lastProjectReplacement.length > 0 && (
              <button
                onClick={() => void undoLastProjectReplacement()}
                disabled={replacementPending}
                className="w-full px-3 py-2 text-sm rounded border border-border-secondary text-foreground-secondary hover:bg-hover disabled:opacity-50"
              >
                直前の一括置換を取り消す
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {projectSearchPending && projectResults.length === 0 ? (
          <EmptyMessage text="検索中..." />
        ) : projectSearchError && visibleMatchCount === 0 ? (
          <EmptyMessage text={projectSearchError} />
        ) : !searchTerm ? (
          <EmptyMessage text="検索語を入力してください" />
        ) : patternError ? null : visibleMatchCount === 0 ? (
          <EmptyMessage text="検索結果がありません" />
        ) : scope === "current" ? (
          <div>
            {currentGroups.map((group) => (
              <section key={group.heading}>
                <h3 className="sticky top-0 px-4 py-2 bg-background-tertiary text-xs font-medium text-foreground-secondary border-b border-border">
                  {group.heading}
                </h3>
                <div className="divide-y divide-border">
                  {group.matches.map(({ match, index }) => (
                    <div
                      key={`${match.from}-${match.to}-${index}`}
                      className={clsx(
                        "p-3 hover:bg-hover transition-colors",
                        currentMatchIndex === index && "bg-active",
                      )}
                    >
                      <button onClick={() => goToMatch(index)} className="w-full text-left">
                        {renderMatchText(match)}
                        <p className="text-xs text-foreground-tertiary mt-1">
                          {match.paragraphNumber ? `段落 ${match.paragraphNumber}` : "見出し"}
                        </p>
                      </button>
                      {showReplace && replaceTouched && isSearchMatchReplaceable(match) && (
                        <button
                          onClick={() => replaceMatch(match)}
                          className="mt-2 flex items-center gap-1 px-2 py-1 text-xs bg-accent-light text-accent hover:bg-active rounded transition-colors"
                        >
                          <Replace className="w-3 h-3" />
                          置換
                        </button>
                      )}
                      {!isSearchMatchReplaceable(match) && (
                        <p className="mt-2 text-xs text-foreground-tertiary">
                          構造を含むため置換できません
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {projectSearchError && (
              <p className="px-4 py-2 text-xs text-danger" role="alert">
                {projectSearchError}
              </p>
            )}
            {projectSearchPending && (
              <p className="px-4 py-2 text-xs text-foreground-secondary">
                検索中... {projectProgress.searched}/{projectProgress.total}
              </p>
            )}
            {projectResults.map((file) => (
              <section key={file.path}>
                <h3
                  className={clsx(
                    "sticky top-0 px-4 py-2 bg-background-tertiary text-xs font-medium text-foreground-secondary flex items-center gap-2",
                    currentFilePath === file.path && "text-accent",
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate">{file.path}</span>
                  <span className="ml-auto">{file.matches.length}件</span>
                </h3>
                {groupMatches(file.matches).map((group) => (
                  <div key={group.heading}>
                    <h4 className="px-4 py-1.5 text-xs text-foreground-tertiary border-t border-border">
                      {group.heading}
                    </h4>
                    {group.matches.map(({ match, index }) => {
                      const projectMatch = file.matches[index];
                      const navigationIndex = projectMatchLocations.findIndex(
                        (location) =>
                          location.file.path === file.path && location.matchIndex === index,
                      );
                      return (
                        <div
                          key={`${projectMatch.rawFrom}-${projectMatch.rawTo}-${index}`}
                          className={clsx(
                            "p-3 hover:bg-hover border-t border-border transition-colors",
                            projectNavigationIndex === navigationIndex && "bg-active",
                          )}
                        >
                          <button
                            onClick={() => {
                              if (!onOpenProjectFile) return;
                              setProjectNavigationIndex(navigationIndex);
                              void onOpenProjectFile(file.path).then(() => {
                                onCurrentMatchIndexChange(index);
                              });
                            }}
                            className="w-full text-left"
                          >
                            <p className="text-sm text-foreground break-words">
                              <span className="bg-accent-light text-accent font-semibold px-1 rounded">
                                {match.text}
                              </span>
                            </p>
                            <p className="text-xs text-foreground-tertiary mt-1">
                              段落 {projectMatch.lineNumber}
                            </p>
                          </button>
                          {showReplace &&
                            replaceTouched &&
                            isSearchMatchReplaceable(projectMatch) && (
                              <button
                                onClick={() =>
                                  void replaceProjectResults([{ ...file, matches: [projectMatch] }])
                                }
                                disabled={replacementPending}
                                className="mt-2 flex items-center gap-1 px-2 py-1 text-xs bg-accent-light text-accent hover:bg-active rounded transition-colors disabled:opacity-50"
                              >
                                <Replace className="w-3 h-3" />
                                置換
                              </button>
                            )}
                          {!isSearchMatchReplaceable(projectMatch) && (
                            <p className="mt-2 text-xs text-foreground-tertiary">
                              構造を含むため置換できません
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      {confirmReplaceAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded border border-border bg-background p-4 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">置換の確認</h3>
            <p className="mt-2 text-sm text-foreground-secondary">
              {replaceableMatchCount}件を置換します。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmReplaceAll(false)}
                className="px-3 py-2 text-sm rounded hover:bg-hover"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (scope === "current") replaceAllCurrentMatches();
                  else void replaceProjectResults(projectResults);
                }}
                disabled={replacementPending}
                className="px-3 py-2 text-sm rounded bg-accent text-accent-foreground hover:bg-accent-hover"
              >
                {replacementPending ? "置換中..." : "置換する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionCheckbox({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={clsx(
        "flex items-center gap-2",
        disabled ? "text-foreground-muted cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded"
      />
      {label}
    </label>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return <div className="p-4 text-center text-sm text-foreground-secondary">{text}</div>;
}

function groupMatches(matches: readonly SearchMatch[]): MatchGroup[] {
  const groups = new Map<string, MatchGroup>();

  matches.forEach((match, index) => {
    const heading = match.heading || "見出しなし";
    const group = groups.get(heading) ?? { heading, matches: [] };
    group.matches.push({ match, index });
    groups.set(heading, group);
  });

  return [...groups.values()];
}
