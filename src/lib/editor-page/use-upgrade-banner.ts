import { useCallback, useEffect, useRef, useState } from "react";

import { isStandaloneMode } from "@/lib/project/project-types";
import { trackUsageEvent } from "@/lib/analytics/usage-events";

import type { EditorMode } from "@/lib/project/project-types";
import { chars } from "./types";

export interface UseUpgradeBannerResult {
  showUpgradeBanner: boolean;
  upgradeBannerDismissed: boolean;
  upgradeTrigger: "first_save" | "character_threshold" | null;
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
  const [upgradeTrigger, setUpgradeTrigger] = useState<"first_save" | "character_threshold" | null>(
    null,
  );
  const promptTrackedRef = useRef(false);
  const standaloneSaveCountRef = useRef(0);
  // The mount value is hydration, while the first subsequent timestamp is the
  // user's first save (including the null -> timestamp transition).
  const saveEffectMountedRef = useRef(false);

  // Track save count to trigger UpgradeBanner in standalone mode
  useEffect(() => {
    if (!saveEffectMountedRef.current) {
      saveEffectMountedRef.current = true;
      return;
    }
    if (!lastSavedTime) return;
    if (!isStandaloneMode(editorMode) || upgradeBannerDismissed) return;

    standaloneSaveCountRef.current += 1;
    // Show banner on 1st save or subsequent saves
    if (standaloneSaveCountRef.current >= 1) {
      setShowUpgradeBanner(true);
      if (!promptTrackedRef.current) {
        promptTrackedRef.current = true;
        setUpgradeTrigger("first_save");
        trackUsageEvent("project_upgrade_prompt_shown", { trigger: "first_save" });
      }
    }
  }, [lastSavedTime, editorMode, upgradeBannerDismissed]);

  // Track character count to trigger UpgradeBanner at 5,000 characters
  useEffect(() => {
    if (!isStandaloneMode(editorMode) || upgradeBannerDismissed) return;
    if (chars(content) >= 5000) {
      setShowUpgradeBanner(true);
      if (!promptTrackedRef.current) {
        promptTrackedRef.current = true;
        setUpgradeTrigger("character_threshold");
        trackUsageEvent("project_upgrade_prompt_shown", { trigger: "character_threshold" });
      }
    }
  }, [content, editorMode, upgradeBannerDismissed]);

  // Reset save count tracking when editor mode changes
  const previousEditorModeRef = useRef(editorMode);
  useEffect(() => {
    if (previousEditorModeRef.current === editorMode) return;
    previousEditorModeRef.current = editorMode;
    standaloneSaveCountRef.current = 0;
    promptTrackedRef.current = false;
    setUpgradeTrigger(null);
  }, [editorMode]);

  const handleUpgradeDismiss = useCallback(() => {
    if (upgradeTrigger) {
      trackUsageEvent("project_upgrade_cancelled", { trigger: upgradeTrigger });
    }
    setShowUpgradeBanner(false);
    setUpgradeBannerDismissed(true);
  }, [upgradeTrigger]);

  return { showUpgradeBanner, upgradeBannerDismissed, upgradeTrigger, handleUpgradeDismiss };
}
