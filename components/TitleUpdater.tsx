"use client";

import { useEffect } from "react";
import type { MdiFileDescriptor } from "@/lib/project/mdi-file";

interface TitleUpdaterProps {
  currentFile: MdiFileDescriptor | null;
  isDirty: boolean;
}

export default function TitleUpdater({ currentFile, isDirty }: TitleUpdaterProps) {
  useEffect(() => {
    const fileName = currentFile?.name ?? (isDirty ? "新規ファイル *" : "新規ファイル");
    const title = `${fileName} - illusions`;
    document.title = title;
  }, [currentFile?.name, isDirty]);

  return null;
}
