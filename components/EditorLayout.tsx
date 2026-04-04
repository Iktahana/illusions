"use client";

import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import ActivityBar, { type ActivityBarView } from "@/components/ActivityBar";
import ContextMenu from "@/components/ContextMenu";
import DesktopOnlyDialog from "@/components/DesktopOnlyDialog";
import EditorDiffView from "@/components/EditorDiffView";
import ErrorBoundary from "@/components/ErrorBoundary";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import ResizablePanel from "@/components/ResizablePanel";
import PdfExportDialog from "@/components/PdfExportDialog";
import RubyDialog from "@/components/RubyDialog";
import SettingsModal from "@/components/SettingsModal";
import SidebarPanel from "@/components/SidebarPanel";
import SidebarSplitter from "@/components/SidebarSplitter";
import TitleUpdater from "@/components/TitleUpdater";
import UnsavedWarningDialog from "@/components/UnsavedWarningDialog";
import UpgradeToProjectBanner from "@/components/UpgradeToProjectBanner";
import WebMenuBar from "@/components/WebMenuBar";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyEditorState } from "@/components/EmptyEditorState";
import { DiffTabContext, type DiffTabContextValue } from "@/contexts/DiffTabContext";
import { EditorSettingsProvider } from "@/contexts/EditorSettingsContext";
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
import type { ExportMetadata } from "@/lib/export/types";
import type { RuleRunner } from "@/lib/linting/rule-runner";
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
    showPdfExportDialog: boolean;
    setShowPdfExportDialog: (show: boolean) => void;
    handlePdfExportConfirm: (settings: PdfExportSettings) => void;
    pdfExportContent: string;
    pdfExportMetadata: ExportMetadata;
  };
  recovery: {
    wasAutoRecovered?: boolean;
    dismissedRecovery: boolean;
    recoveryExiting: boolean;
    setRecoveryExiting: Dispatch<SetStateAction<boolean>>;
    currentFileName?: string;
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
    handleNewTerminalTab: () => void;
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
    setSelectedCharCount: Dispatch<SetStateAction<number>>;
    searchOpenTrigger: number;
    searchInitialTerm?: string;
    setEditorViewInstance: NonNullable<
      React.ComponentProps<typeof NovelEditor>["onEditorViewReady"]
    >;
    handleShowAllSearchResults: NonNullable<
      React.ComponentProps<typeof NovelEditor>["onShowAllSearchResults"]
    >;
    ruleRunner: RuleRunner;
    handleLintIssuesUpdated: (issues: LintIssue[]) => void;
    handleNlpError: (error: Error) => void;
    handleOpenRubyDialog: () => void;
    handleToggleTcy: () => void;
    handleOpenDictionary: (searchTerm?: string) => void;
    handleShowLintHint: NonNullable<React.ComponentProps<typeof NovelEditor>["onShowLintHint"]>;
    handleIgnoreCorrection: NonNullable<
      React.ComponentProps<typeof NovelEditor>["onIgnoreCorrection"]
    >;
    switchTab: (tabId: string) => void;
    updateTab: (tabId: string, updates: Partial<EditorTabState>) => void;
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
  return (
    <DiffTabContext.Provider value={providers.diffTabContextValue}>
      <TerminalTabContext.Provider value={providers.terminalTabContextValue}>
        <EditorSettingsProvider settings={providers.settings} handlers={providers.settingsHandlers}>
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

            <PdfExportDialog
              isOpen={dialogs.showPdfExportDialog}
              onClose={() => dialogs.setShowPdfExportDialog(false)}
              onExport={dialogs.handlePdfExportConfirm}
              content={dialogs.pdfExportContent}
              metadata={dialogs.pdfExportMetadata}
            />

            {!chrome.isElectron && recovery.wasAutoRecovered && !recovery.dismissedRecovery && (
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
            )}

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

              {(activityBar.topView !== "none" || activityBar.bottomView !== "none") && (
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
                        <SidebarPanel view={activityBar.topView} {...mainArea.sidebarPanelProps} />
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
                        const panelSearchOpenTrigger = panelParams?.searchOpenTrigger ?? 0;
                        const panelSearchInitialTerm = panelParams?.searchInitialTerm as
                          | string
                          | undefined;
                        const isActivePanel = panelBufferId === panelActiveTabId;
                        const panelMdiEnabled = panelFileType === ".mdi";
                        const panelGfmEnabled = panelFileType !== ".txt";

                        const liveTab = mainArea.tabsRef.current.find(
                          (tab) => tab.id === panelBufferId,
                        );
                        const liveEditorTab = liveTab && isEditorTab(liveTab) ? liveTab : undefined;
                        const panelContent = liveEditorTab?.content ?? "";
                        const panelLastSavedContent = liveEditorTab?.lastSavedContent ?? "";
                        const panelPendingExternalContent =
                          liveEditorTab?.pendingExternalContent ?? null;

                        if (mainArea.editorDiff && isActivePanel) {
                          return (
                            <EditorDiffView
                              snapshotContent={mainArea.editorDiff.snapshotContent}
                              currentContent={mainArea.editorDiff.currentContent}
                              snapshotLabel={mainArea.editorDiff.label}
                              onClose={() => mainArea.setEditorDiff(null)}
                            />
                          );
                        }

                        if (isActivePanel) {
                          return (
                            <ErrorBoundary sectionName="エディタ">
                              <div
                                ref={mainArea.editorDomRef as React.RefObject<HTMLDivElement>}
                                className="h-full"
                              >
                                <NovelEditor
                                  key={`tab-${panelBufferId}-${panelFilePath}-${panelEditorKey}-${panelParams?.pendingExternalContent ?? ""}`}
                                  initialContent={panelContent}
                                  onChange={mainArea.handleChange}
                                  onInsertText={mainArea.handleInsertText}
                                  onSelectionChange={mainArea.setSelectedCharCount}
                                  searchOpenTrigger={panelSearchOpenTrigger}
                                  searchInitialTerm={panelSearchInitialTerm}
                                  onEditorViewReady={mainArea.setEditorViewInstance}
                                  onShowAllSearchResults={mainArea.handleShowAllSearchResults}
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
                        }

                        return (
                          <div
                            className="h-full cursor-pointer"
                            onClick={() => {
                              mainArea.switchTab(panelBufferId);
                              panelApi.setActive();
                            }}
                          >
                            <ErrorBoundary sectionName="エディタ">
                              <NovelEditor
                                key={`tab-${panelBufferId}-${panelFilePath}-inactive`}
                                initialContent={panelLastSavedContent}
                                mdiExtensionsEnabled={panelMdiEnabled}
                                gfmEnabled={panelGfmEnabled}
                              />
                            </ErrorBoundary>
                          </div>
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
              </main>

              <ResizablePanel
                side="right"
                defaultWidth={chrome.compactMode ? 200 : 256}
                minWidth={chrome.compactMode ? 160 : 200}
                maxWidth={chrome.compactMode ? 320 : 400}
                collapsible={true}
                isCollapsed={inspector.isRightPanelCollapsed || mainArea.tabs.length === 0}
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
        </EditorSettingsProvider>
      </TerminalTabContext.Provider>
    </DiffTabContext.Provider>
  );
}
