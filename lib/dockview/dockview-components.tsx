"use client";

/**
 * Dockview panel and tab header components for the illusions editor.
 */

import { useCallback, useEffect, useRef } from "react";
import { X, Terminal, GitCompare } from "lucide-react";
import type { IDockviewPanelProps, IDockviewPanelHeaderProps } from "dockview-react";
import type { EditorPanelParams, TerminalPanelParams, DiffPanelParams, BufferId } from "./types";
import { useBufferStoreInstance, useBuffer } from "./buffer-store";
import { useTerminalTabContext } from "@/contexts/TerminalTabContext";
import { useDiffTabContext } from "@/contexts/DiffTabContext";
import RealTerminalPanel from "@/components/TerminalPanel";
import DiffView from "@/components/DiffView";
import ContextMenu from "@/components/ContextMenu";
import { useContextMenu } from "@/lib/hooks/use-context-menu";

// ---------------------------------------------------------------------------
// EditorPanel — content component rendered inside each dockview panel
// ---------------------------------------------------------------------------

/**
 * Props injected from the parent EditorPage via the dockview component registry.
 * These mirror the callbacks that page.tsx currently passes to NovelEditor.
 */
export interface EditorPanelInjectedProps {
  /** Render the NovelEditor component */
  renderEditor: (props: {
    bufferId: BufferId;
    panelId: string;
    content: string;
    onChange: (content: string) => void;
  }) => React.ReactNode;
}

export function EditorPanel({ api, params, containerApi }: IDockviewPanelProps<EditorPanelParams>) {
  const store = useBufferStoreInstance();
  const buffer = useBuffer(params.bufferId);
  const panelId = api.id;

  // Subscribe to cross-panel content changes for this buffer
  const editorContentRef = useRef<string>(buffer?.content ?? "");

  useEffect(() => {
    if (!params.bufferId) return;

    const unsub = store.subscribe(params.bufferId, (event) => {
      // Ignore changes we originated
      if (event.sourcePanelId === panelId) return;
      // Update the editor content ref (actual Milkdown sync handled by parent)
      editorContentRef.current = event.content;
    });
    return unsub;
  }, [store, params.bufferId, panelId]);

  // Update panel title when buffer file name changes
  useEffect(() => {
    const title = buffer?.file?.name ?? `新規ファイル${buffer?.fileType ?? ".mdi"}`;
    api.setTitle(title);
  }, [api, buffer?.file?.name, buffer?.fileType]);

  const handleChange = useCallback(
    (content: string) => {
      store.setBufferContent(params.bufferId, content, panelId);
    },
    [store, params.bufferId, panelId],
  );

  if (!buffer) {
    return (
      <div className="flex items-center justify-center h-full text-foreground-muted text-sm">
        バッファが見つかりません
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden" data-panel-id={panelId}>
      {/* NovelEditor will be rendered here by the parent via renderEditor */}
      <div className="h-full" data-buffer-id={params.bufferId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DockviewTabHeader — custom tab component matching illusions TabBar style
// ---------------------------------------------------------------------------

export function DockviewTabHeader({
  api,
  params,
  containerApi,
}: IDockviewPanelHeaderProps<EditorPanelParams>) {
  const buffer = useBuffer(params.bufferId);
  const isActive = api.isActive;
  const { menu: contextMenu, show: showContextMenu, close: closeContextMenu } = useContextMenu();

  const label = buffer?.file?.name ?? `新規ファイル${buffer?.fileType ?? ".mdi"}`;

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      api.close();
    },
    [api],
  );

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        api.close();
      }
    },
    [api],
  );

  const handleDoubleClick = useCallback(() => {
    // Promote preview tab to pinned
    if (buffer?.isPreview) {
      // Will be handled by the tab manager shim
    }
  }, [buffer?.isPreview]);

  /** Execute the action selected from the context menu (both Electron and Web paths). */
  const handleContextMenuAction = useCallback(
    (action: string) => {
      if (action === "popout" && buffer) {
        const electronAPI = window.electronAPI;
        if (electronAPI?.editor?.popoutPanel) {
          // Electron: use native popout IPC
          void electronAPI.editor.popoutPanel(
            params.bufferId,
            buffer.content,
            buffer.file?.name ?? `新規ファイル${buffer.fileType}`,
            buffer.fileType,
          );
        } else {
          // Web: store content in sessionStorage so the popout can read it
          sessionStorage.setItem(`popout-content-${params.bufferId}`, buffer.content);
          const urlParams = new URLSearchParams({
            "popout-buffer": params.bufferId,
            fileName: buffer.file?.name ?? `新規ファイル${buffer.fileType}`,
            fileType: buffer.fileType,
          });
          window.open(
            `${window.location.origin}?${urlParams.toString()}`,
            "_blank",
            "width=900,height=700",
          );
        }
      } else if (action === "close") {
        api.close();
      }
    },
    [api, buffer, params.bufferId],
  );

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const menuItems = [
        { label: "新しいウィンドウで開く", action: "popout" },
        { label: "閉じる", action: "close" },
      ];

      // show() handles Electron (native menu) and Web (HTML overlay) automatically.
      // For Electron it returns the chosen action immediately; for Web it returns null
      // and the action is delivered via onContextMenuAction below.
      const action = await showContextMenu(e, menuItems);
      if (action) {
        void handleContextMenuAction(action);
      }
    },
    [handleContextMenuAction, showContextMenu],
  );

  return (
    <div
      className={`
        group relative flex items-center gap-1.5 px-3 h-full
        text-xs whitespace-nowrap transition-colors duration-100
        cursor-pointer select-none
        ${isActive ? "text-foreground" : "text-foreground-secondary hover:text-foreground"}
      `}
      onMouseDown={handleMiddleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Dirty indicator */}
      {buffer?.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />}

      {/* Tab label */}
      <span className={`truncate${buffer?.isPreview ? " italic opacity-75" : ""}`}>{label}</span>

      {/* Close button */}
      <span
        role="button"
        tabIndex={-1}
        className={`
          shrink-0 w-4 h-4 flex items-center justify-center rounded-sm
          hover:bg-hover-strong transition-colors
          ${isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"}
        `}
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <X size={12} />
      </span>

      {/* Web context menu overlay (null in Electron — native menu is used instead) */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onAction={handleContextMenuAction}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TerminalPanel — xterm.js content component for terminal tabs
// ---------------------------------------------------------------------------

export function TerminalPanel({ api, params }: IDockviewPanelProps<TerminalPanelParams>) {
  const { getTerminalTabBySessionId, setTerminalTabExited } = useTerminalTabContext();
  const tab = getTerminalTabBySessionId(params.sessionId);

  const handleExit = useCallback(
    (exitCode: number) => {
      setTerminalTabExited(params.sessionId, exitCode);
    },
    [params.sessionId, setTerminalTabExited],
  );

  return (
    <div className="h-full w-full overflow-hidden" data-panel-id={api.id}>
      <RealTerminalPanel
        sessionId={params.sessionId}
        status={tab?.status ?? "connecting"}
        exitCode={tab?.exitCode ?? null}
        onExit={handleExit}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TerminalTabHeader — tab header for terminal tabs
// ---------------------------------------------------------------------------

export function TerminalTabHeader({ api, params }: IDockviewPanelHeaderProps<TerminalPanelParams>) {
  const isActive = api.isActive;
  const label = api.title;

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      api.close();
    },
    [api],
  );

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        api.close();
      }
    },
    [api],
  );

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const electronAPI = window.electronAPI;
      if (electronAPI?.showContextMenu) {
        // Electron: use native context menu
        const action = await electronAPI.showContextMenu([{ label: "閉じる", action: "close" }]);
        if (action === "close") {
          api.close();
        }
      } else {
        // Web fallback: close directly
        api.close();
      }
    },
    [api],
  );

  return (
    <div
      className={`
        group relative flex items-center gap-1.5 px-3 h-full
        text-xs whitespace-nowrap transition-colors duration-100
        cursor-pointer select-none
        ${isActive ? "text-foreground" : "text-foreground-secondary hover:text-foreground"}
      `}
      onMouseDown={handleMiddleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Terminal icon */}
      <Terminal size={12} className="shrink-0" />

      {/* Tab label */}
      <span className="truncate">{label}</span>

      {/* Close button */}
      <span
        role="button"
        tabIndex={-1}
        className={`
          shrink-0 w-4 h-4 flex items-center justify-center rounded-sm
          hover:bg-hover-strong transition-colors
          ${isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"}
        `}
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <X size={12} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffPanel — real diff content component using DiffView
// ---------------------------------------------------------------------------

export function DiffPanel({ api, params }: IDockviewPanelProps<DiffPanelParams>) {
  const { getDiffTabBySourceTabId, acceptDiskContent, keepEditorContent, closeDiffTab } =
    useDiffTabContext();

  const tab = getDiffTabBySourceTabId(params.sourceTabId);

  const handleAcceptDisk = useCallback(() => {
    acceptDiskContent(api.id);
  }, [acceptDiskContent, api.id]);

  const handleKeepEditor = useCallback(() => {
    keepEditorContent(api.id);
  }, [keepEditorContent, api.id]);

  const handleClose = useCallback(() => {
    closeDiffTab(api.id);
  }, [closeDiffTab, api.id]);

  if (!tab) {
    return (
      <div className="flex items-center justify-center h-full text-foreground-muted text-sm">
        差分データが見つかりません
      </div>
    );
  }

  return (
    <DiffView
      tab={tab}
      onAcceptDisk={handleAcceptDisk}
      onKeepEditor={handleKeepEditor}
      onClose={handleClose}
    />
  );
}

// ---------------------------------------------------------------------------
// DiffTabHeader — tab header for diff tabs
// ---------------------------------------------------------------------------

export function DiffTabHeader({ api, params }: IDockviewPanelHeaderProps<DiffPanelParams>) {
  const isActive = api.isActive;
  const label = api.title;

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      api.close();
    },
    [api],
  );

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        api.close();
      }
    },
    [api],
  );

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const electronAPI = window.electronAPI;
      if (electronAPI?.showContextMenu) {
        // Electron: use native context menu
        const action = await electronAPI.showContextMenu([{ label: "閉じる", action: "close" }]);
        if (action === "close") {
          api.close();
        }
      } else {
        // Web fallback: close directly
        api.close();
      }
    },
    [api],
  );

  return (
    <div
      className={`
        group relative flex items-center gap-1.5 px-3 h-full
        text-xs whitespace-nowrap transition-colors duration-100
        cursor-pointer select-none
        ${isActive ? "text-foreground" : "text-foreground-secondary hover:text-foreground"}
      `}
      onMouseDown={handleMiddleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Diff icon */}
      <GitCompare size={12} className="shrink-0" />

      {/* Tab label (source file name) */}
      <span className="truncate">{label}</span>

      {/* Close button */}
      <span
        role="button"
        tabIndex={-1}
        className={`
          shrink-0 w-4 h-4 flex items-center justify-center rounded-sm
          hover:bg-hover-strong transition-colors
          ${isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"}
        `}
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <X size={12} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component registry for DockviewReact
// ---------------------------------------------------------------------------

export const dockviewComponents = {
  editor: EditorPanel,
  terminal: TerminalPanel,
  diff: DiffPanel,
};

export const dockviewTabComponents = {
  default: DockviewTabHeader,
  terminal: TerminalTabHeader,
  diff: DiffTabHeader,
};
