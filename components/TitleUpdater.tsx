"use client";

import { useEffect } from "react";
import { isProjectMode, isStandaloneMode, type EditorMode } from "@/lib/project/project-types";

interface TitleUpdaterProps {
  editorMode: EditorMode;
  isDirty: boolean;
}

export default function TitleUpdater({ editorMode, isDirty }: TitleUpdaterProps) {
  useEffect(() => {
    let name: string;
    if (isProjectMode(editorMode)) {
      name = editorMode.name;
    } else if (isStandaloneMode(editorMode) && editorMode.fileHandle) {
      name = isDirty ? `${editorMode.fileName} *` : editorMode.fileName;
    } else {
      name = isDirty ? "新規ファイル *" : "新規ファイル";
    }
    document.title = `${name} - illusions`;
  }, [editorMode, isDirty]);

  return null;
}
