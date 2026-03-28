import { useCallback, useEffect, useRef, useState } from "react";

import { isStandaloneMode } from "@/lib/project/project-types";

import type { EditorMode } from "@/lib/project/project-types";
import { chars } from "./types";

export interface UseUpgradeBannerResult {
  showUpgradeBanner: boolean;
  upgradeBannerDismissed: boolean;
  handleUpgradeDismiss: () => void;
}

/**
 * Tracks upgrade banner visibility for standalone mode.
 * Shows the banner after the first save or when content exceeds 5,000 characters.
 */
export function useUpgradeBanner(
  editorMode: EditorMode,
  content: string,
  lastSavedTime: number | null,
): UseUpgradeBannerResult {
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [upgradeBannerDismissed, setUpgradeBannerDismissed] = useState(false);
  const standaloneSaveCountRef = useRef(0);
  // Tracks whether we've seen a prior save (so we skip the initial load)
  const upgradeSaveInitializedRef = useRef(false);

  // Track save count to trigger UpgradeBanner in standalone mode
  useEffect(() => {
    if (!lastSavedTime) return;
    if (!upgradeSaveInitializedRef.current) {
      // First time seeing lastSavedTime; skip (this is initial load, not a user save)
      upgradeSaveInitializedRef.current = true;
      return;
    }
    if (!isStandaloneMode(editorMode) || upgradeBannerDismissed) return;

    standaloneSaveCountRef.current += 1;
    // Show banner on 1st save or subsequent saves
    if (standaloneSaveCountRef.current >= 1) {
      setShowUpgradeBanner(true);
    }
  }, [lastSavedTime, editorMode, upgradeBannerDismissed]);

  // Track character count to trigger UpgradeBanner at 5,000 characters
  useEffect(() => {
    if (!isStandaloneMode(editorMode) || upgradeBannerDismissed) return;
    if (chars(content) >= 5000) {
      setShowUpgradeBanner(true);
    }
  }, [content, editorMode, upgradeBannerDismissed]);

  // Reset save count tracking when editor mode changes
  useEffect(() => {
    standaloneSaveCountRef.current = 0;
  }, [editorMode]);

  const handleUpgradeDismiss = useCallback(() => {
    setShowUpgradeBanner(false);
    setUpgradeBannerDismissed(true);
  }, []);

  return { showUpgradeBanner, upgradeBannerDismissed, handleUpgradeDismiss };
}
