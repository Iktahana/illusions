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
    } else if (isStandaloneMode(editorMode) && (editorMode.fileHandle ?? editorMode.filePath)) {
      // Show the file name when a file is open — either via Web File System Access API
      // (fileHandle) or via Electron native path (filePath). Both are non-null only when an
      // existing file has been opened; a new unsaved tab has both as null/undefined.
      name = isDirty ? `${editorMode.fileName} *` : editorMode.fileName;
    } else {
      name = isDirty ? "新規ファイル *" : "新規ファイル";
    }
    document.title = `${name} - illusions`;
  }, [editorMode, isDirty]);

  return null;
}
