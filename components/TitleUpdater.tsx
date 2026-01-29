"use client";

import { useEffect } from "react";
import type { MdiFileDescriptor } from "@/lib/mdi-file";

interface TitleUpdaterProps {
  currentFile: MdiFileDescriptor | null;
  isDirty: boolean;
}

export default function TitleUpdater({ currentFile, isDirty }: TitleUpdaterProps) {
  useEffect(() => {
    const fileName = currentFile?.name ?? (isDirty ? "無題（未保存）" : "無題");
    const title = `${fileName} - Illusions`;
    document.title = title;
  }, [currentFile?.name, isDirty]);

  return null;
}
