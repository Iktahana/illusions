"use client";

import { useCallback, useEffect, useState } from "react";
import { MilkdownProvider } from "@milkdown/react";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/react";
import type { EditorView } from "@milkdown/prose/view";
import clsx from "clsx";

import MilkdownEditor from "./editor/MilkdownEditor";
import { useTypographySettings } from "@/contexts/EditorSettingsContext";
import { localPreferences } from "@/lib/storage/local-preferences";
import type { DocumentFormat } from "@/lib/document-format";

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
}: EditorProps): React.ReactElement {
  const { charsPerLine } = useTypographySettings();
  const [isVertical, setIsVertical] = useState(() => {
    if (typeof window === "undefined") return false;
    return localPreferences.getWritingMode() === "vertical";
  });

  const toggleWritingMode = useCallback(() => {
    setIsVertical((current) => !current);
  }, []);

  useEffect(() => {
    localPreferences.setWritingMode(isVertical ? "vertical" : "horizontal");
  }, [isVertical]);

  useEffect(() => {
    registerWritingModeToggle?.(toggleWritingMode);
    return () => registerWritingModeToggle?.(null);
  }, [registerWritingModeToggle, toggleWritingMode]);

  return (
    <div className={clsx("h-full min-h-0 overflow-hidden bg-background-secondary", className)}>
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
          />
        </ProsemirrorAdapterProvider>
      </MilkdownProvider>
    </div>
  );
}
