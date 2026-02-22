"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { getChaptersFromDOM, parseMarkdownChapters, type Chapter } from "@/lib/utils";

const AUTO_REFRESH_INTERVAL_MS = 10_000;

interface UseChaptersResult {
  chapters: Chapter[];
  refresh: () => void;
}

/**
 * Shared hook for chapter detection with auto-refresh.
 * Prefers DOM-based chapters (more reliable), falls back to Markdown parsing.
 */
export function useChapters(content: string): UseChaptersResult {
  const [refreshToken, setRefreshToken] = useState(0);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const timer = setInterval(
      () => setRefreshToken((v) => v + 1),
      AUTO_REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, []);

  const chapters = useMemo(() => {
    const domChapters = getChaptersFromDOM();
    if (domChapters.length > 0 && domChapters.some((ch) => ch.anchorId)) {
      return domChapters;
    }
    return parseMarkdownChapters(content);
  }, [content, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((v) => v + 1), []);

  return { chapters, refresh };
}
