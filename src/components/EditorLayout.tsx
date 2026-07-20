"use client";

import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import ActivityBar, { type ActivityBarView } from "@/components/ActivityBar";
import ContextMenu from "@/shared/ui/ContextMenu";
import DesktopOnlyDialog from "@/components/DesktopOnlyDialog";
import EditorDiffView from "@/components/EditorDiffView";
import ErrorBoundary from "@/shared/ui/ErrorBoundary";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import { buildEditorPanelKey } from "@/lib/dockview/editor-panel-key";
import ResizablePanel from "@/shared/ui/ResizablePanel";
import ExportDialog from "@/components/ExportDialog";
import RubyDialog from "@/components/RubyDialog";
import SearchDialog from "@/components/SearchDialog";
import SettingsModal from "@/components/SettingsModal";
import SidebarPanel from "@/components/SidebarPanel";
import SidebarSplitter from "@/components/SidebarSplitter";
import TitleUpdater from "@/components/TitleUpdater";
import UnsavedWarningDialog from "@/components/UnsavedWarningDialog";
import UpgradeToProjectBanner from "@/components/UpgradeToProjectBanner";
import WebMenuBar from "@/components/WebMenuBar";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { EmptyEditorState } from "@/components/EmptyEditorState";
import { DiffTabContext, type DiffTabContextValue } from "@/contexts/DiffTabContext";
import { EditorSettingsProvider } from "@/contexts/EditorSettingsContext";
import {
  IgnoredCorrectionsProvider,
  type IgnoredCorrectionsContextValue,
} from "@/contexts/IgnoredCorrectionsContext";
import { TerminalTabContext, type TerminalTabContextValue } from "@/contexts/TerminalTabContext";
import {
  dockviewTabComponents,
  TerminalPanel,
  DiffPanel,
} from "@/lib/dockview/dockview-components";
import type { EditorSettings, EditorSettingsHandlers } from "@/lib/editor-page/use-editor-settings";
import type { PanelState } from "@/lib/editor-page/use-panel-state";
import type { RecentProjectEntry } from "@/lib/editor-page/types";
import {
  isProjectMode,
  isStandaloneMode,
  type EditorMode,
  type SupportedFileExtension,
} from "@/lib/project/project-types";
import type { MdiFileDescriptor } from "@/lib/project/mdi-file";
import { isEditorTab, type EditorTabState, type TabState } from "@/lib/tab-manager/tab-types";
import type { ContextMenuState } from "@/lib/hooks/use-context-menu";
import type { LintIssue } from "@/lib/linting/types";
import type { PdfExportSettings } from "@/lib/export/pdf-export-settings";
import type { DocxExportSettings } from "@/lib/export/docx-export-settings";
import type { EpubExportOptions } from "@/lib/export/epub-shared";
import type { ExportMetadata } from "@/lib/export/types";
import type { RuleRunnerLike } from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";
import { decideResponsivePanels } from "@/lib/editor-page/responsive-layout";
import { useWindowWidth } from "@/lib/editor-page/use-window-width";
import { DockviewReact } from "dockview-react";
type SidebarPanelSharedProps = Omit<React.ComponentProps<typeof SidebarPanel>, "view">;

interface ConfirmRemoveRecentState {
  projectId: string;
  message: string;
}

interface EditorLayoutProps {
  providers: {
    diffTabContextValue: DiffTabContextValue;
    terminalTabContextValue: TerminalTabContextValue;
    settings: EditorSettings;
    settingsHandlers: EditorSettingsHandlers;
    ignoredCorrectionsContextValue: IgnoredCorrectionsContextValue;
  };
  chrome: {
    currentFile: MdiFileDescriptor | null;
    isDirty: boolean;
    isElectron: boolean;
    handleMenuAction: (action: string) => void;
    recentProjects: RecentProjectEntry[];
    compactMode: boolean;
  };
  dialogs: {
    unsavedWarning: {
      showWarning: boolean;
      handleSave: () => Promise<void>;
      handleDiscard: () => void;
      handleCancel: () => void;
    };
    pendingCloseTabId: string | null;
    pendingCloseFileName: string;
    handleCloseTabSave: () => Promise<void>;
    handleCloseTabDiscard: () => void;
    handleCloseTabCancel: () => void;
    showDesktopOnlyDialog: boolean;
    setShowDesktopOnlyDialog: Dispatch<SetStateAction<boolean>>;
    confirmRemoveRecent: ConfirmRemoveRecentState | null;
    setConfirmRemoveRecent: (value: ConfirmRemoveRecentState | null) => void;
    handleDeleteRecentProject: (projectId: string) => void | Promise<void>;
    showSettingsModal: boolean;
    setShowSettingsModal: (value: boolean) => void;
    settingsInitialCategory: React.ComponentProps<typeof SettingsModal>["initialCategory"];
    setSettingsInitialCategory: (
      category: React.ComponentProps<typeof SettingsModal>["initialCategory"],
    ) => void;
    showRubyDialog: boolean;
    setShowRubyDialog: (show: boolean) => void;
    rubySelectedText: string;
    handleApplyRuby: React.ComponentProps<typeof RubyDialog>["onApply"];
    exportDialog: {
      state: { format: "pdf" | "docx" | "epub"; content: string; metadata: ExportMetadata } | null;
      onClose: () => void;
      onPdfExport: (settings: PdfExportSettings) => void;
      onDocxExport: (settings: DocxExportSettings) => void;
      onEpubExport: (options: EpubExportOptions) => void;
      content: string;
      metadata: ExportMetadata;
      fileType?: string;
    };
    printDialog: {
      state: { content: string; metadata: ExportMetadata } | null;
      onClose: () => void;
      onPrint: (settings: PdfExportSettings) => void;
      content: string;
      metadata: ExportMetadata;
      fileType?: string;
    };
  };
  recovery: {
    wasAutoRecovered?: boolean;
    dismissedRecovery: boolean;
    recoveryExiting: boolean;
    setRecoveryExiting: Dispatch<SetStateAction<boolean>>;
    currentFileName?: string;
    /** #1966 H-5/H-6: 復元バッファがディスクと食い違う場合の選択肢データ。 */
    recoveredBuffer?: { content: string; fileName: string } | null;
    /** バッファ内容をエディタへ適用する（H-5）。 */
    applyRecoveredBuffer?: () => void;
    /** バッファを破棄しディスク内容を維持する（H-6）。 */
    discardRecoveredBuffer?: () => void;
  };
  upgrade: {
    showUpgradeBanner: boolean;
    upgradeBannerDismissed: boolean;
    editorMode: EditorMode;
    featuresProjectMode: boolean;
    handleUpgrade: () => void | Promise<void>;
    handleUpgradeDismiss: () => void;
  };
  activityBar: {
    topView: ActivityBarView;
    bottomView: ActivityBarView;
    setTopView: (view: ActivityBarView) => void;
    setBottomView: (view: ActivityBarView) => void;
    handleNewTerminalTab?: () => void;
  };
  mainArea: {
    tabs: TabState[];
    editorMode: EditorMode;
    newTab: (fileType?: SupportedFileExtension) => void;
    openFile: () => Promise<void>;
    setNewFileTrigger: Dispatch<SetStateAction<number>>;
    handleTabBarContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
    tabBarMenu: ContextMenuState | null;
    handleTabBarMenuAction: (action: string) => void;
    closeTabBarMenu: () => void;
    handleDockviewReady: React.ComponentProps<typeof DockviewReact>["onReady"];
    sidebarPanelProps: SidebarPanelSharedProps;
    tabsRef: MutableRefObject<TabState[]>;
    editorDiff: PanelState["editorDiff"];
    setEditorDiff: (diff: PanelState["editorDiff"]) => void;
    editorDomRef: RefObject<HTMLDivElement | null>;
    handleChange: NonNullable<React.ComponentProps<typeof NovelEditor>["onChange"]>;
    handleInsertText: NonNullable<React.ComponentProps<typeof NovelEditor>["onInsertText"]>;
    onSelectionChange: (
      charCount: number,
      manuscriptCells: number,
      manuscriptPages: number,
    ) => void;
    onSelectionRangeChange: NonNullable<
      React.ComponentProps<typeof NovelEditor>["onSelectionRangeChange"]
    >;
    searchOpenTrigger: number;
    searchInitialTerm?: string;
    // 共有検索 state。SearchDialog は dockview パネル外（<main>）でレンダリングする。
    searchTerm: string;
    caseSensitive: boolean;
    searchMatches: React.ComponentProps<typeof SearchDialog>["matches"];
    currentMatchIndex: number;
    isSearchDialogOpen: boolean;
    onSearchTermChange: React.ComponentProps<typeof SearchDialog>["onSearchTermChange"];
    onCaseSensitiveChange: React.ComponentProps<typeof SearchDialog>["onCaseSensitiveChange"];
    onCurrentMatchIndexChange: React.ComponentProps<
      typeof SearchDialog
    >["onCurrentMatchIndexChange"];
    onOpenSearchDialog: () => void;
    onCloseSearchDialog: () => void;
    onToggleSearchDialog: () => void;
    setEditorViewInstance: NonNullable<
      React.ComponentProps<typeof NovelEditor>["onEditorViewReady"]
    >;
    handleShowAllSearchResults: NonNullable<
      React.ComponentProps<typeof SearchDialog>["onShowAllResults"]
    >;
    ruleRunner: RuleRunnerLike | null;
    handleLintIssuesUpdated: (issues: LintIssue[]) => void;
    handleNlpError: (error: Error) => void;
    handleOpenRubyDialog: () => void;
    handleToggleTcy: () => void;
    handleOpenDictionary: (searchTerm?: string) => void;
    handleShowLintHint: NonNullable<React.ComponentProps<typeof NovelEditor>["onShowLintHint"]>;
    handleIgnoreCorrection: NonNullable<
      React.ComponentProps<typeof NovelEditor>["onIgnoreCorrection"]
    >;
    handleAddToUserDictionary: NonNullable<
      React.ComponentProps<typeof NovelEditor>["onAddToUserDictionary"]
    >;
    dictEntryRuleIds: React.ComponentProps<typeof NovelEditor>["dictEntryRuleIds"];
    switchTab: (tabId: string) => void;
    updateTab: (tabId: string, updates: Partial<EditorTabState>) => void;
    registerFlush: NonNullable<React.ComponentProps<typeof NovelEditor>["registerFlush"]>;
    registerWritingModeToggle: NonNullable<
      React.ComponentProps<typeof NovelEditor>["registerWritingModeToggle"]
    >;
  };
  inspector: {
    isRightPanelCollapsed: boolean;
    handleToggleRightPanel: () => void;
    activeEditorTab: EditorTabState | undefined;
    props: React.ComponentProps<typeof Inspector>;
    showSaveToast: boolean;
    saveToastExiting: boolean;
  };
}

export default function EditorLayout({
  providers,
  chrome,
  dialogs,
  recovery,
  upgrade,
  activityBar,
  mainArea,
  inspector,
}: EditorLayoutProps): React.JSX.Element {
  // #1856: 狭いウィンドウでは本文先頭がクリップされないよう、サイドパネルを
  // 表示上だけ自動折りたたみする。永続化されたパネル状態
  // （inspector.isRightPanelCollapsed 等）は変更しない。
  const windowWidth = useWindowWidth();
  const { collapseLeft: autoCollapseLeft, collapseRight: autoCollapseRight } =
    decideResponsivePanels({
      // windowWidth が 0（SSR 初期 / マウント前）の場合は折りたたまない。
      windowWidth: windowWidth || Number.POSITIVE_INFINITY,
      compactMode: chrome.compactMode,
      rightAlreadyCollapsed: inspector.isRightPanelCollapsed,
    });

  return (
    <DiffTabContext.Provider value={providers.diffTabContextValue}>
      <TerminalTabContext.Provider value={providers.terminalTabContextValue}>
        <EditorSettingsProvider settings={providers.settings} handlers={providers.settingsHandlers}>
          <IgnoredCorrectionsProvider value={providers.ignoredCorrectionsContextValue}>
            <div className="h-screen flex flex-col overflow-hidden relative">
              <TitleUpdater editorMode={upgrade.editorMode} isDirty={chrome.isDirty} />

              {!chrome.isElectron && (
                <WebMenuBar
                  onMenuAction={chrome.handleMenuAction}
                  recentProjects={chrome.recentProjects}
                  checkedState={{ compactMode: chrome.compactMode }}
                />
              )}

              <UnsavedWarningDialog
                isOpen={dialogs.unsavedWarning.showWarning}
                fileName={chrome.currentFile?.name || "新規ファイル"}
                onSave={dialogs.unsavedWarning.handleSave}
                onDiscard={dialogs.unsavedWarning.handleDiscard}
                onCancel={dialogs.unsavedWarning.handleCancel}
              />

              <UnsavedWarningDialog
                isOpen={dialogs.pendingCloseTabId !== null}
                fileName={dialogs.pendingCloseFileName}
                onSave={dialogs.handleCloseTabSave}
                onDiscard={dialogs.handleCloseTabDiscard}
                onCancel={dialogs.handleCloseTabCancel}
              />

              <DesktopOnlyDialog
                isOpen={dialogs.showDesktopOnlyDialog}
                onClose={() => dialogs.setShowDesktopOnlyDialog(false)}
                featureName="ターミナル"
              />

              <ConfirmDialog
                isOpen={dialogs.confirmRemoveRecent !== null}
                title="プロジェクトが見つかりません"
                message={dialogs.confirmRemoveRecent?.message ?? ""}
                confirmLabel="削除する"
                cancelLabel="キャンセル"
                dangerous={true}
                onConfirm={() => {
                  if (dialogs.confirmRemoveRecent) {
                    const { projectId } = dialogs.confirmRemoveRecent;
                    dialogs.setConfirmRemoveRecent(null);
                    void dialogs.handleDeleteRecentProject(projectId);
                  }
                }}
                onCancel={() => dialogs.setConfirmRemoveRecent(null)}
              />

              {upgrade.showUpgradeBanner &&
                !upgrade.upgradeBannerDismissed &&
                isStandaloneMode(upgrade.editorMode) &&
                upgrade.featuresProjectMode && (
                  <UpgradeToProjectBanner
                    onUpgrade={() => void upgrade.handleUpgrade()}
                    onDismiss={upgrade.handleUpgradeDismiss}
                  />
                )}

              <SettingsModal
                isOpen={dialogs.showSettingsModal}
                onClose={() => {
                  dialogs.setShowSettingsModal(false);
                  dialogs.setSettingsInitialCategory(undefined);
                }}
                initialCategory={dialogs.settingsInitialCategory}
              />

              <RubyDialog
                isOpen={dialogs.showRubyDialog}
                onClose={() => dialogs.setShowRubyDialog(false)}
                selectedText={dialogs.rubySelectedText}
                onApply={dialogs.handleApplyRuby}
              />

              <ExportDialog
                isOpen={dialogs.exportDialog.state != null}
                initialFormat={dialogs.exportDialog.state?.format ?? "pdf"}
                onClose={dialogs.exportDialog.onClose}
                onExportPdf={dialogs.exportDialog.onPdfExport}
                onExportDocx={dialogs.exportDialog.onDocxExport}
                onExportEpub={dialogs.exportDialog.onEpubExport}
                content={dialogs.exportDialog.content}
                metadata={dialogs.exportDialog.metadata}
                fileType={dialogs.exportDialog.fileType}
              />

              <ExportDialog
                isOpen={dialogs.printDialog.state != null}
                mode="print"
                initialFormat="pdf"
                onClose={dialogs.printDialog.onClose}
                onExportPdf={dialogs.printDialog.onPrint}
                onExportDocx={() => {}}
                content={dialogs.printDialog.content}
                metadata={dialogs.printDialog.metadata}
                fileType={dialogs.printDialog.fileType}
              />

              {/* #1966 H-5/H-6: 復元バッファがディスクと食い違う場合は「使用 / 破棄」を
                  選択させる（自動フェードアウトしない）。食い違いが無ければ従来どおり
                  情報バナー（自動フェードアウト + ✕）。Electron でも表示する。 */}
              {recovery.wasAutoRecovered &&
                !recovery.dismissedRecovery &&
                (recovery.recoveredBuffer ? (
                  <div className="fixed left-0 top-10 right-0 z-50 bg-background-elevated border-b border-border px-4 py-3 flex items-center justify-between shadow-lg animate-slide-in-down">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-warning rounded-full flex-shrink-0 animate-pulse-glow"></div>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold text-foreground">
                          未保存の変更が見つかりました：
                        </span>{" "}
                        <span className="font-mono text-warning">
                          {recovery.recoveredBuffer.fileName}
                        </span>{" "}
                        <span className="text-foreground-secondary">
                          前回終了時の未保存内容を使用しますか？
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <button
                        onClick={() => recovery.applyRecoveredBuffer?.()}
                        className="px-3 py-1 text-sm font-medium rounded bg-accent text-accent-foreground hover:opacity-90 transition-all duration-200"
                      >
                        このバッファを使用
                      </button>
                      <button
                        onClick={() => recovery.discardRecoveredBuffer?.()}
                        className="px-3 py-1 text-sm font-medium rounded border border-border text-foreground hover:bg-hover transition-all duration-200"
                      >
                        破棄
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`fixed left-0 top-10 right-0 z-50 bg-background-elevated border-b border-border px-4 py-3 flex items-center justify-between shadow-lg ${recovery.recoveryExiting ? "animate-slide-out-up" : "animate-slide-in-down"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-success rounded-full flex-shrink-0 animate-pulse-glow"></div>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold text-foreground">
                          ✓ 前回編集したファイルを復元しました：
                        </span>{" "}
                        <span className="font-mono text-success">{recovery.currentFileName}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        recovery.setRecoveryExiting(true);
                      }}
                      className="text-foreground-secondary hover:text-foreground hover:bg-hover text-lg font-medium flex-shrink-0 ml-4 w-8 h-8 rounded flex items-center justify-center transition-all duration-200 hover:scale-110"
                    >
                      ✕
                    </button>
                  </div>
                ))}

              <div className="flex-1 flex overflow-hidden">
                <ActivityBar
                  topView={activityBar.topView}
                  bottomView={activityBar.bottomView}
                  compactMode={chrome.compactMode}
                  onTopViewChange={(view) => {
                    if (view === "settings") {
                      dialogs.setShowSettingsModal(true);
                    } else {
                      activityBar.setTopView(view);
                    }
                  }}
                  onBottomViewChange={(view) => {
                    if (view === "settings") {
                      dialogs.setShowSettingsModal(true);
                    } else {
                      activityBar.setBottomView(view);
                    }
                  }}
                  onNewTerminal={activityBar.handleNewTerminalTab}
                  onOpenAccountSettings={() => {
                    dialogs.setSettingsInitialCategory("account");
                    dialogs.setShowSettingsModal(true);
                  }}
                />

                {!autoCollapseLeft &&
                  (activityBar.topView !== "none" || activityBar.bottomView !== "none") && (
                    <ResizablePanel
                      side="left"
                      defaultWidth={chrome.compactMode ? 200 : 256}
                      minWidth={chrome.compactMode ? 160 : 200}
                      maxWidth={chrome.compactMode ? 320 : 400}
                      className=""
                    >
                      {(() => {
                        const topPanel =
                          activityBar.topView !== "none" ? (
                            <SidebarPanel
                              view={activityBar.topView}
                              {...mainArea.sidebarPanelProps}
                            />
                          ) : null;
                        const bottomPanel =
                          activityBar.bottomView !== "none" ? (
                            <SidebarPanel
                              view={activityBar.bottomView}
                              {...mainArea.sidebarPanelProps}
                            />
                          ) : null;

                        if (topPanel && bottomPanel) {
                          return <SidebarSplitter top={topPanel} bottom={bottomPanel} />;
                        }

                        return topPanel || bottomPanel;
                      })()}
                    </ResizablePanel>
                  )}

                <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative bg-background">
                  {mainArea.tabs.length === 0 && (
                    <div className="absolute inset-0 z-10">
                      <EmptyEditorState
                        onNewFile={() => {
                          if (isProjectMode(mainArea.editorMode)) {
                            activityBar.setTopView("files");
                            mainArea.setNewFileTrigger((prev) => prev + 1);
                          } else {
                            mainArea.newTab();
                          }
                        }}
                        onOpenFile={() => void mainArea.openFile()}
                        onNewTerminal={activityBar.handleNewTerminalTab}
                      />
                    </div>
                  )}

                  {/* Snapshot-diff overlay. Rendered here (not inside the
                    dockview panel) so it appears as soon as `editorDiff` is
                    set, independent of dockview's panel re-render timing and
                    of which panel is active. */}
                  {mainArea.editorDiff && (
                    <div className="absolute inset-0 z-20 bg-background">
                      <EditorDiffView
                        snapshotContent={mainArea.editorDiff.snapshotContent}
                        currentContent={mainArea.editorDiff.currentContent}
                        snapshotLabel={mainArea.editorDiff.label}
                        onClose={() => mainArea.setEditorDiff(null)}
                      />
                    </div>
                  )}

                  {}
                  <div
                    className="flex-1 flex flex-col overflow-hidden"
                    onContextMenu={mainArea.handleTabBarContextMenu}
                  >
                    <DockviewReact
                      className="flex-1 dockview-theme-illusions"
                      components={{
                        editor: ({ api: panelApi, params: panelParams }) => {
                          const panelBufferId = panelParams?.bufferId ?? "";
                          const panelFilePath = panelParams?.filePath ?? "";
                          const panelFileType = (panelParams?.fileType ?? ".mdi") as string;
                          const panelEditorKey = panelParams?.editorKey ?? 0;
                          const panelActiveTabId = panelParams?.activeTabId ?? "";
                          const isActivePanel = panelBufferId === panelActiveTabId;
                          const panelMdiEnabled = panelFileType === ".mdi";
                          const panelGfmEnabled = panelFileType !== ".txt";

                          const liveTab = mainArea.tabsRef.current.find(
                            (tab) => tab.id === panelBufferId,
                          );
                          const liveEditorTab =
                            liveTab && isEditorTab(liveTab) ? liveTab : undefined;
                          const panelContent = liveEditorTab?.content ?? "";
                          const panelPendingExternalContent =
                            liveEditorTab?.pendingExternalContent ?? null;

                          // NOTE: the snapshot-diff view is rendered as a
                          // top-level overlay on <main> (see below), NOT inside
                          // the dockview panel. Rendering it here depended on the
                          // panel re-evaluating its closure when `editorDiff`
                          // changed — which dockview does not reliably do — so
                          // clicking "比較" appeared to do nothing.
                          //
                          // #1878: active / inactive で別 key・別 component を返すと、
                          // タブ切替で isActivePanel が反転するたびに Milkdown/ProseMirror
                          // instance が unmount され Undo/Redo history が破棄されていた。
                          // 同一 key・同一 NovelEditor instance を保ち、active 状態に応じて
                          // ラッパの挙動（focus 伝播 / クリックでアクティブ化）と
                          // app 全体に紐づく callback（onEditorViewReady 等）だけを切り替える。
                          // initialContent は active/inactive 共にライブ content を使い、
                          // inactive で lastSavedContent を表示して最新 dirty 内容とずれる
                          // 退行（#1874 関連）も併せて防ぐ。
                          return (
                            <ErrorBoundary sectionName="エディタ">
                              <div
                                ref={
                                  isActivePanel
                                    ? (mainArea.editorDomRef as React.RefObject<HTMLDivElement>)
                                    : undefined
                                }
                                className={isActivePanel ? "h-full" : "h-full cursor-pointer"}
                                // NOTE: onFocus は子孫（Milkdown contenteditable）からの bubble を利用。
                                // tabIndex は不要。パネルへのフォーカスを dockview に伝え activeTabId を最新化する。
                                // 既に active な panel に対する setActive() は dockview 内部で
                                // content 要素の DOM detach → re-attach を引き起こし scroll を 0 に
                                // リセットしてしまう (#1457 回帰)。isActive 時はスキップする。
                                onFocus={() => {
                                  if (!panelApi.isActive) {
                                    panelApi.setActive();
                                  }
                                }}
                                onClick={
                                  isActivePanel
                                    ? undefined
                                    : () => {
                                        mainArea.switchTab(panelBufferId);
                                        panelApi.setActive();
                                      }
                                }
                              >
                                <NovelEditor
                                  // key は active 状態に依存させない。editorKey は表示設定変更などで
                                  // 真の再マウントが必要なときだけ変わる（タブ切替では変えない #1878）。
                                  key={buildEditorPanelKey(
                                    panelBufferId,
                                    panelFilePath,
                                    panelEditorKey,
                                  )}
                                  initialContent={panelContent}
                                  // 編集・選択系の callback は app 全体で 1 本の active tab content /
                                  // selection に書き込むため、active panel のみに配線する。
                                  // inactive panel の instance は履歴保持のため生かしておくが、
                                  // それらの編集がアクティブタブの内容を汚さないようにする (#1878)。
                                  onChange={isActivePanel ? mainArea.handleChange : undefined}
                                  onInsertText={
                                    isActivePanel ? mainArea.handleInsertText : undefined
                                  }
                                  onSelectionChange={
                                    isActivePanel ? mainArea.onSelectionChange : undefined
                                  }
                                  onSelectionRangeChange={
                                    isActivePanel ? mainArea.onSelectionRangeChange : undefined
                                  }
                                  // 検索の入力/表示は <main> の SearchDialog が担当。
                                  // pane へは「語を反映」「開く」「トグル」の安定 callback のみ渡す
                                  // （dockview の凍結クロージャでも安定 ref は機能するため）。
                                  onSearchTermChange={mainArea.onSearchTermChange}
                                  onOpenSearchDialog={mainArea.onOpenSearchDialog}
                                  onToggleSearchDialog={mainArea.onToggleSearchDialog}
                                  // app 全体に 1 つだけ存在する「アクティブな EditorView」は
                                  // active panel のみが登録する。inactive panel が登録すると
                                  // split view で最後にレンダリングされた pane が勝ってしまう。
                                  onEditorViewReady={
                                    isActivePanel ? mainArea.setEditorViewInstance : undefined
                                  }
                                  registerFlush={isActivePanel ? mainArea.registerFlush : undefined}
                                  registerWritingModeToggle={
                                    isActivePanel ? mainArea.registerWritingModeToggle : undefined
                                  }
                                  lintingRuleRunner={mainArea.ruleRunner}
                                  onLintIssuesUpdated={mainArea.handleLintIssuesUpdated}
                                  onNlpError={mainArea.handleNlpError}
                                  onOpenSpeechSettings={() => {
                                    dialogs.setSettingsInitialCategory("speech");
                                    dialogs.setShowSettingsModal(true);
                                  }}
                                  onOpenRubyDialog={mainArea.handleOpenRubyDialog}
                                  onToggleTcy={mainArea.handleToggleTcy}
                                  onOpenDictionary={mainArea.handleOpenDictionary}
                                  onShowLintHint={mainArea.handleShowLintHint}
                                  onIgnoreCorrection={mainArea.handleIgnoreCorrection}
                                  onAddToUserDictionary={mainArea.handleAddToUserDictionary}
                                  dictEntryRuleIds={mainArea.dictEntryRuleIds}
                                  mdiExtensionsEnabled={panelMdiEnabled}
                                  gfmEnabled={panelGfmEnabled}
                                  externalContent={panelPendingExternalContent}
                                  onExternalContentApplied={() => {
                                    mainArea.updateTab(panelBufferId, {
                                      pendingExternalContent: null,
                                    });
                                  }}
                                />
                              </div>
                            </ErrorBoundary>
                          );
                        },
                        terminal: TerminalPanel,
                        diff: DiffPanel,
                      }}
                      tabComponents={dockviewTabComponents}
                      onReady={mainArea.handleDockviewReady}
                    />

                    {mainArea.tabBarMenu && (
                      <ContextMenu
                        menu={mainArea.tabBarMenu}
                        onAction={mainArea.handleTabBarMenuAction}
                        onClose={mainArea.closeTabBarMenu}
                      />
                    )}
                  </div>

                  {inspector.showSaveToast && (
                    <div
                      className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-background-elevated border border-border rounded-lg shadow-lg flex items-center gap-2 z-50 ${
                        inspector.saveToastExiting
                          ? "animate-save-toast-out"
                          : "animate-save-toast-in"
                      }`}
                    >
                      <span className="text-success text-sm font-medium">✓</span>
                      <span className="text-foreground-secondary text-sm">保存完了</span>
                    </div>
                  )}

                  {/* フローティング検索窓。dockview パネル外（<main> 直下）でレンダリング
                    することで、共有検索 state（searchTerm/matches など変化する値）を
                    live に受け取れる。portal で document.body 直下に出るため、anchorRef
                    にはアクティブエディタの DOM を渡して初期位置を計算する。 */}
                  <SearchDialog
                    isOpen={mainArea.isSearchDialogOpen}
                    onClose={mainArea.onCloseSearchDialog}
                    onShowAllResults={mainArea.handleShowAllSearchResults}
                    searchTerm={mainArea.searchTerm}
                    onSearchTermChange={mainArea.onSearchTermChange}
                    caseSensitive={mainArea.caseSensitive}
                    onCaseSensitiveChange={mainArea.onCaseSensitiveChange}
                    matches={mainArea.searchMatches}
                    currentMatchIndex={mainArea.currentMatchIndex}
                    onCurrentMatchIndexChange={mainArea.onCurrentMatchIndexChange}
                    anchorRef={mainArea.editorDomRef}
                  />
                </main>

                <ResizablePanel
                  side="right"
                  defaultWidth={chrome.compactMode ? 200 : 256}
                  minWidth={chrome.compactMode ? 160 : 200}
                  maxWidth={chrome.compactMode ? 320 : 400}
                  collapsible={true}
                  isCollapsed={
                    inspector.isRightPanelCollapsed ||
                    autoCollapseRight ||
                    mainArea.tabs.length === 0
                  }
                  onToggleCollapse={inspector.handleToggleRightPanel}
                >
                  <ErrorBoundary sectionName="インスペクタ">
                    {inspector.activeEditorTab ? (
                      <Inspector {...inspector.props} />
                    ) : (
                      <div className="h-full flex items-center justify-center p-4">
                        <p className="text-foreground-secondary text-sm text-center">
                          インスペクタはエディタタブでのみ使用できます
                        </p>
                      </div>
                    )}
                  </ErrorBoundary>
                </ResizablePanel>
              </div>
            </div>
          </IgnoredCorrectionsProvider>
        </EditorSettingsProvider>
      </TerminalTabContext.Provider>
    </DiffTabContext.Provider>
  );
}
