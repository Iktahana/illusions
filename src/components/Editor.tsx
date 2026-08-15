"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MilkdownProvider } from "@milkdown/react";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/react";
import type { EditorView } from "@milkdown/prose/view";
import clsx from "clsx";

import MilkdownEditor from "./editor/MilkdownEditor";
import { useTypographySettings } from "@/contexts/EditorSettingsContext";
import { trackUsageEvent } from "@/lib/analytics/usage-events";
import { localPreferences } from "@/lib/storage/local-preferences";
import type { DocumentFormat } from "@/lib/document-format";
import { getDocumentAdapter } from "@/lib/document-format";
import { EditorInteractionStore, type EditorInteractionHandle } from "@/lib/editor-interaction";
import { buildEditorContextMenu } from "@/lib/editor-interaction";
import { EditorInteractionProvider } from "@/lib/editor-interaction/context";
import EditorToolbar from "./editor/EditorToolbar";
import BubbleMenu from "./editor/BubbleMenu";

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  className?: string;
  onEditorViewReady?: (view: EditorView) => void;
  documentFormat: DocumentFormat;
  externalContent?: string | null;
  onExternalContentApplied?: () => void;
  registerFlush?: (flush: (() => string | null) | null) => void;
  registerWritingModeToggle?: (toggle: (() => void) | null) => void;
  active?: boolean;
  registerInteraction?: (handle: EditorInteractionHandle | null) => void;
}

/** Minimal application shell around the package-owned Milkdown editor. */
export default function NovelEditor({
  initialContent = "",
  onChange,
  className,
  onEditorViewReady,
  documentFormat,
  externalContent,
  onExternalContentApplied,
  registerFlush,
  registerWritingModeToggle,
  active = true,
  registerInteraction,
}: EditorProps): React.ReactElement {
  const { charsPerLine } = useTypographySettings();
  const [isVertical, setIsVertical] = useState(() => {
    if (typeof window === "undefined") return false;
    return localPreferences.getWritingMode() === "vertical";
  });
  const editorId = useId();
  const editorSurfaceRef = useRef<HTMLDivElement>(null);
  const interaction = useMemo(
    () => new EditorInteractionStore(editorId, documentFormat, getDocumentAdapter(documentFormat)),
    [documentFormat, editorId],
  );
  useEffect(() => {
    interaction.setActive(active);
  }, [active, interaction]);
  useEffect(() => {
    if (!active || !registerInteraction) return;
    registerInteraction(interaction);
    return () => registerInteraction(null);
  }, [active, interaction, registerInteraction]);

  const toggleWritingMode = useCallback(() => {
    setIsVertical((current) => {
      const next = !current;
      trackUsageEvent("editor_layout_changed", {
        action: "writing_mode",
        value: next ? "vertical" : "horizontal",
      });
      return next;
    });
  }, []);

  useEffect(() => {
    localPreferences.setWritingMode(isVertical ? "vertical" : "horizontal");
  }, [isVertical]);

  useEffect(() => {
    registerWritingModeToggle?.(toggleWritingMode);
    return () => registerWritingModeToggle?.(null);
  }, [registerWritingModeToggle, toggleWritingMode]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!window.electronAPI?.showEditorContextMenu) return;
      event.preventDefault();
      void window.electronAPI.showEditorContextMenu(
        buildEditorContextMenu(interaction.getSnapshot().availability),
      );
    },
    [interaction],
  );

  return (
    <div
      ref={editorSurfaceRef}
      onContextMenu={handleContextMenu}
      className={clsx(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background-secondary",
        className,
      )}
    >
      <EditorInteractionProvider value={interaction}>
        <EditorToolbar isVertical={isVertical} onToggleWritingMode={toggleWritingMode} />
        <MilkdownProvider>
          <ProsemirrorAdapterProvider>
            <MilkdownEditor
              initialContent={initialContent}
              onChange={onChange}
              onEditorViewReady={onEditorViewReady}
              documentFormat={documentFormat}
              isVertical={isVertical}
              lineLength={charsPerLine > 0 ? charsPerLine : null}
              externalContent={externalContent}
              onExternalContentApplied={onExternalContentApplied}
              registerFlush={registerFlush}
              interaction={interaction}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>
        <BubbleMenu isVertical={isVertical} editorSurface={editorSurfaceRef} />
      </EditorInteractionProvider>
    </div>
  );
}
