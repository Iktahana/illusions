"use client";

import { useEffect } from "react";
import { isProjectMode, type EditorMode } from "@/lib/project/project-types";

interface TitleUpdaterProps {
  editorMode: EditorMode;
  isDirty: boolean;
}

export default function TitleUpdater({ editorMode, isDirty }: TitleUpdaterProps) {
  useEffect(() => {
    const name = isProjectMode(editorMode)
      ? editorMode.name
      : isDirty
        ? "新規ファイル *"
        : "新規ファイル";
    document.title = `${name} - illusions`;
  }, [editorMode, isDirty]);

  return null;
}
