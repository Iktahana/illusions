"use client";

import React, { createContext, useContext, useCallback, useMemo, useState } from "react";

import type { EditorMode, ProjectMode, StandaloneMode } from "@/lib/project-types";
import { isProjectMode, isStandaloneMode } from "@/lib/project-types";

interface EditorModeContextType {
  editorMode: EditorMode;
  setProjectMode: (project: ProjectMode) => void;
  setStandaloneMode: (standalone: StandaloneMode) => void;
  resetMode: () => void;
  isProject: boolean;
  isStandalone: boolean;
}

const EditorModeContext = createContext<EditorModeContextType | undefined>(undefined);

export function EditorModeProvider({ children }: { children: React.ReactNode }) {
  const [editorMode, setEditorMode] = useState<EditorMode>(null);

  const setProjectMode = useCallback((project: ProjectMode): void => {
    setEditorMode(project);
  }, []);

  const setStandaloneMode = useCallback((standalone: StandaloneMode): void => {
    setEditorMode(standalone);
  }, []);

  const resetMode = useCallback((): void => {
    setEditorMode(null);
  }, []);

  const isProject = isProjectMode(editorMode);
  const isStandalone = isStandaloneMode(editorMode);

  const value = useMemo<EditorModeContextType>(
    () => ({
      editorMode,
      setProjectMode,
      setStandaloneMode,
      resetMode,
      isProject,
      isStandalone,
    }),
    [editorMode, setProjectMode, setStandaloneMode, resetMode, isProject, isStandalone]
  );

  return (
    <EditorModeContext.Provider value={value}>
      {children}
    </EditorModeContext.Provider>
  );
}

export function useEditorMode(): EditorModeContextType {
  const context = useContext(EditorModeContext);
  if (context === undefined) {
    throw new Error("useEditorMode は EditorModeProvider の内側で使用してください");
  }
  return context;
}
