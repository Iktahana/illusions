"use client";

import { Download } from "lucide-react";

interface DesktopAppDownloadButtonProps {
  className?: string;
  /** Button label. Defaults to "デスクトップ版をダウンロード" */
  label?: string;
}

/**
 * A styled link button that navigates to the desktop app download page.
 * デスクトップアプリのダウンロードページへのリンクボタン。
 */
export default function DesktopAppDownloadButton({
  className = "",
  label = "デスクトップ版をダウンロード",
}: DesktopAppDownloadButtonProps): React.JSX.Element {
  return (
    <a
      href="https://www.illusions.app/downloads/"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors ${className}`}
    >
      <Download size={16} />
      {label}
    </a>
  );
}
