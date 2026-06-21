"use client";

import Explorer, { FilesPanel } from "@/components/Explorer";
import ErrorBoundary from "@/shared/ui/ErrorBoundary";
import SearchResults from "@/components/SearchResults";
import WordFrequency from "@/components/WordFrequency";
import Characters from "@/components/Characters";
import Dictionary from "@/components/Dictionary";
import Outline from "@/components/Outline";
import { isProjectMode } from "@/lib/project/project-types";

import type { ActivityBarView } from "@/components/ActivityBar";
import type { EditorMode } from "@/lib/project/project-types";
import type { SearchMatch, SearchTarget } from "@/lib/editor-page/find-search-matches";
import type { AffectedTab } from "@/lib/tab-manager/tab-path-sync";
import type { EditorView } from "@milkdown/prose/view";

interface SidebarPanelProps {
  /** Which panel to render. */
  view: ActivityBarView;
  /** Current editor content (Markdown string). */
  content: string;
  /** Current editor mode (project / standalone / null). */
  editorMode: EditorMode;
  /** Whether compact layout is active. */
  compactMode: boolean;
  /** Called when a chapter heading in the explorer is clicked. */
  onChapterClick: (anchorId: string) => void;
  /** Called when the editor should insert text at the current cursor. */
  onInsertText: (text: string) => void;
  /** 共有検索 state（単一 source of truth）。SearchDialog と同期する。 */
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (value: boolean) => void;
  regexSearch: boolean;
  onRegexSearchChange: (value: boolean) => void;
  wholeWordSearch: boolean;
  onWholeWordSearchChange: (value: boolean) => void;
  normalizeVariants: boolean;
  onNormalizeVariantsChange: (value: boolean) => void;
  excludeComments: boolean;
  onExcludeCommentsChange: (value: boolean) => void;
  searchTarget: SearchTarget;
  onSearchTargetChange: (value: SearchTarget) => void;
  selectionOnly: boolean;
  onSelectionOnlyChange: (value: boolean) => void;
  hasSearchSelection: boolean;
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  onCurrentMatchIndexChange: (index: number) => void;
  /** Called when the search panel should close. */
  onCloseSearchResults: () => void;
  /** The active ProseMirror EditorView (required by the search panel). */
  editorViewInstance: EditorView | null;
  /** Dictionary search trigger (changes trigger a new search). */
  dictionarySearchTrigger: { term: string; id: number };
  /** Path of the currently open file (used by the word frequency panel). */
  currentFilePath?: string;
  projectSearchBuffers: ReadonlyMap<string, string>;
  onProjectBufferChange: (path: string, content: string) => void | Promise<void>;
  /** Trigger counter for opening the new-file dialog inside the files panel. */
  newFileTrigger: number;
  /** Opens a project file by VFS path. */
  openProjectFile: (vfsPath: string, options: { preview: boolean }) => Promise<void>;
  /** Notify the tab manager that a project file/folder was renamed/moved (#1868). */
  onFileRenamed: (oldPath: string, newPath: string) => void;
  /** Notify the tab manager that a project file/folder was deleted (#1868). */
  onFileDeleted: (deletedPath: string) => void;
  /** List open tabs affected by deleting a path, for dirty-confirmation (#1868). */
  findTabsAffectedByDelete: (deletedPath: string) => AffectedTab[];
  /** Increments the editor key, forcing the editor to remount. */
  incrementEditorKey: () => void;
  /** Called when a word in the word-frequency panel should be searched. */
  onWordSearch: (word: string) => void;
}

/**
 * Renders the appropriate sidebar panel for the given ActivityBarView.
 *
 * Extracted from `app/page.tsx` to keep the page component focused on layout
 * orchestration rather than per-panel render logic.
 */
export default function SidebarPanel({
  view,
  content,
  editorMode,
  compactMode,
  onChapterClick,
  onInsertText,
  searchTerm,
  onSearchTermChange,
  caseSensitive,
  onCaseSensitiveChange,
  regexSearch,
  onRegexSearchChange,
  wholeWordSearch,
  onWholeWordSearchChange,
  normalizeVariants,
  onNormalizeVariantsChange,
  excludeComments,
  onExcludeCommentsChange,
  searchTarget,
  onSearchTargetChange,
  selectionOnly,
  onSelectionOnlyChange,
  hasSearchSelection,
  searchMatches,
  currentMatchIndex,
  onCurrentMatchIndexChange,
  onCloseSearchResults,
  editorViewInstance,
  dictionarySearchTrigger,
  currentFilePath,
  projectSearchBuffers,
  onProjectBufferChange,
  newFileTrigger,
  openProjectFile,
  onFileRenamed,
  onFileDeleted,
  findTabsAffectedByDelete,
  onWordSearch,
}: SidebarPanelProps): React.ReactElement | null {
  switch (view) {
    case "files":
      return (
        <aside className="h-full bg-background flex flex-col">
          <div className="p-4 flex-1 overflow-y-auto">
            <FilesPanel
              projectName={isProjectMode(editorMode) ? editorMode.name : undefined}
              onFileClick={(vfsPath) => {
                void openProjectFile(vfsPath, { preview: false });
              }}
              onFileDoubleClick={(vfsPath) => {
                void openProjectFile(vfsPath, { preview: false });
              }}
              onFileMiddleClick={(vfsPath) => {
                void openProjectFile(vfsPath, { preview: false });
              }}
              newFileTrigger={newFileTrigger}
              onFileRenamed={onFileRenamed}
              onFileDeleted={onFileDeleted}
              findTabsAffectedByDelete={findTabsAffectedByDelete}
            />
          </div>
        </aside>
      );
    case "explorer":
      return (
        <ErrorBoundary sectionName="エクスプローラ">
          <Explorer
            compactMode={compactMode}
            content={content}
            onChapterClick={onChapterClick}
            onInsertText={onInsertText}
          />
        </ErrorBoundary>
      );
    case "search":
      return (
        <SearchResults
          editorView={editorViewInstance}
          searchTerm={searchTerm}
          onSearchTermChange={onSearchTermChange}
          caseSensitive={caseSensitive}
          onCaseSensitiveChange={onCaseSensitiveChange}
          regexSearch={regexSearch}
          onRegexSearchChange={onRegexSearchChange}
          wholeWordSearch={wholeWordSearch}
          onWholeWordSearchChange={onWholeWordSearchChange}
          normalizeVariants={normalizeVariants}
          onNormalizeVariantsChange={onNormalizeVariantsChange}
          excludeComments={excludeComments}
          onExcludeCommentsChange={onExcludeCommentsChange}
          searchTarget={searchTarget}
          onSearchTargetChange={onSearchTargetChange}
          selectionOnly={selectionOnly}
          onSelectionOnlyChange={onSelectionOnlyChange}
          hasSelection={hasSearchSelection}
          matches={searchMatches}
          currentMatchIndex={currentMatchIndex}
          onCurrentMatchIndexChange={onCurrentMatchIndexChange}
          projectSearchEnabled={isProjectMode(editorMode)}
          projectOpenBuffers={projectSearchBuffers}
          currentFilePath={currentFilePath}
          onOpenProjectFile={(path) => openProjectFile(path, { preview: false })}
          onProjectBufferChange={onProjectBufferChange}
          onClose={onCloseSearchResults}
        />
      );
    case "outline":
      return <Outline content={content} onHeadingClick={onChapterClick} />;
    case "characters":
      return <Characters content={content} />;
    case "dictionary":
      return (
        <Dictionary
          content={content}
          initialSearchTerm={dictionarySearchTrigger.term}
          searchTriggerId={dictionarySearchTrigger.id}
          editorMode={editorMode}
        />
      );
    case "wordfreq":
      return (
        <WordFrequency content={content} filePath={currentFilePath} onWordSearch={onWordSearch} />
      );
    default:
      return null;
  }
}
