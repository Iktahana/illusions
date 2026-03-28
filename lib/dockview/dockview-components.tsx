"use client";

/**
 * Dockview panel and tab header components for the illusions editor.
 */

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import type {
  IDockviewPanelProps,
  IDockviewPanelHeaderProps,
  DockviewApi,
} from "dockview-react";
import type { EditorPanelParams, BufferId } from "./types";
import {
  useBufferStoreInstance,
  useBuffer,
} from "./buffer-store";
import { useContextMenu } from "@/lib/hooks/use-context-menu";
import ContextMenu from "@/components/ContextMenu";

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

export function EditorPanel({
  api,
  params,
  containerApi,
}: IDockviewPanelProps<EditorPanelParams>) {
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
  const { menu, show: showContextMenu, close: closeContextMenu } = useContextMenu();

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

  const handleTabAction = useCallback(
    (action: string) => {
      if (action === "popout" && buffer) {
        const electronAPI = window.electronAPI;
        if (electronAPI?.editor?.popoutPanel) {
          void electronAPI.editor.popoutPanel(
            params.bufferId,
            buffer.content,
            buffer.file?.name ?? `新規ファイル${buffer.fileType}`,
            buffer.fileType,
          );
        } else {
          // Web fallback: open in a new window
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

      const items = [
        { label: "新しいウィンドウで開く", action: "popout" },
        { label: "閉じる", action: "close" },
      ];

      // Electron: returns selected action; Web: returns null (action via ContextMenu onAction)
      const action = await showContextMenu(e, items);
      if (action) {
        handleTabAction(action);
      }
    },
    [showContextMenu, handleTabAction],
  );

  return (
    <>
      <div
        className={`
          group relative flex items-center gap-1.5 px-3 h-full
          text-xs whitespace-nowrap transition-colors duration-100
          cursor-pointer select-none
          ${
            isActive
              ? "text-foreground"
              : "text-foreground-secondary hover:text-foreground"
          }
        `}
        onMouseDown={handleMiddleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Dirty indicator */}
        {buffer?.isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
        )}

        {/* Tab label */}
        <span
          className={`truncate${buffer?.isPreview ? " italic opacity-75" : ""}`}
        >
          {label}
        </span>

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

      {/* Web context menu overlay */}
      {menu && (
        <ContextMenu
          menu={menu}
          onAction={handleTabAction}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component registry for DockviewReact
// ---------------------------------------------------------------------------

export const dockviewComponents = {
  editor: EditorPanel,
};

export const dockviewTabComponents = {
  default: DockviewTabHeader,
};
