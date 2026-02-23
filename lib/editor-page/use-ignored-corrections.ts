/**
 * React hook for managing ignored corrections.
 * Loads from VFS (project mode) or localStorage (standalone mode),
 * and provides methods to add/remove/check ignored corrections.
 *
 * 無視された校正指摘を管理するReactフック。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getIgnoredCorrectionsService } from "@/lib/ignored-corrections-service";
import { isProjectMode, isStandaloneMode } from "@/lib/project-types";
import type { EditorMode, IgnoredCorrection } from "@/lib/project-types";

/**
 * Simple string hash for paragraph context.
 * Produces a short hex hash to identify a specific paragraph.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return (hash >>> 0).toString(16);
}

export interface UseIgnoredCorrectionsResult {
  ignoredCorrections: IgnoredCorrection[];
  /** Ignore a single occurrence (with paragraph context hash) or all occurrences */
  ignoreCorrection: (ruleId: string, text: string, paragraphText?: string) => void;
  /** Remove an ignored correction */
  unignoreCorrection: (ruleId: string, text: string, context?: string) => void;
  /** Check if a given (ruleId, text, paragraphText) combination is ignored */
  isIgnored: (ruleId: string, text: string, paragraphText?: string) => boolean;
  /** Compute a paragraph context hash */
  computeContextHash: (paragraphText: string) => string;
}

/**
 * Manages ignored corrections for the current editor mode.
 *
 * @param editorMode Current editor mode (project / standalone / null)
 */
export function useIgnoredCorrections(
  editorMode: EditorMode,
): UseIgnoredCorrectionsResult {
  const [ignoredCorrections, setIgnoredCorrections] = useState<IgnoredCorrection[]>([]);
  const loadedModeRef = useRef<string | null>(null);

  // Load on mount or mode change
  useEffect(() => {
    let cancelled = false;

    const modeKey = editorMode
      ? editorMode.type === "project"
        ? `project:${editorMode.projectId}`
        : `standalone:${editorMode.fileName}`
      : null;

    // Avoid reloading for the same mode
    if (modeKey === loadedModeRef.current) return;
    loadedModeRef.current = modeKey;

    if (!editorMode) {
      setIgnoredCorrections([]);
      return;
    }

    const service = getIgnoredCorrectionsService();

    if (isProjectMode(editorMode)) {
      service
        .loadIgnoredCorrections()
        .then((data) => {
          if (!cancelled) setIgnoredCorrections(data);
        })
        .catch((err) => {
          console.warn("[useIgnoredCorrections] Failed to load:", err);
          if (!cancelled) setIgnoredCorrections([]);
        });
    } else if (isStandaloneMode(editorMode)) {
      setIgnoredCorrections(
        service.loadIgnoredCorrectionsStandalone(editorMode.fileName),
      );
    }

    return () => {
      cancelled = true;
    };
  }, [editorMode]);

  const computeContextHash = useCallback(
    (paragraphText: string): string => hashString(paragraphText),
    [],
  );

  const ignoreCorrection = useCallback(
    (ruleId: string, text: string, paragraphText?: string) => {
      const context = paragraphText ? hashString(paragraphText) : undefined;
      const service = getIgnoredCorrectionsService();

      if (editorMode && isProjectMode(editorMode)) {
        // Optimistic update: update UI immediately, then persist to VFS in background
        setIgnoredCorrections((prev) => {
          const already = prev.some(
            (c) => c.ruleId === ruleId && c.text === text && c.context === context,
          );
          if (already) return prev;
          return [...prev, { ruleId, text, context, addedAt: Date.now() }];
        });
        service
          .addIgnoredCorrection(ruleId, text, context)
          .then(setIgnoredCorrections)
          .catch((err) =>
            console.error("[useIgnoredCorrections] Failed to add:", err),
          );
      } else if (editorMode && isStandaloneMode(editorMode)) {
        const updated = service.addIgnoredCorrectionStandalone(
          editorMode.fileName,
          ruleId,
          text,
          context,
        );
        setIgnoredCorrections(updated);
      }
    },
    [editorMode],
  );

  const unignoreCorrection = useCallback(
    (ruleId: string, text: string, context?: string) => {
      const service = getIgnoredCorrectionsService();

      if (editorMode && isProjectMode(editorMode)) {
        service
          .removeIgnoredCorrection(ruleId, text, context)
          .then(setIgnoredCorrections)
          .catch((err) =>
            console.error("[useIgnoredCorrections] Failed to remove:", err),
          );
      } else if (editorMode && isStandaloneMode(editorMode)) {
        const updated = service.removeIgnoredCorrectionStandalone(
          editorMode.fileName,
          ruleId,
          text,
          context,
        );
        setIgnoredCorrections(updated);
      }
    },
    [editorMode],
  );

  const isIgnored = useCallback(
    (ruleId: string, text: string, paragraphText?: string): boolean => {
      const context = paragraphText ? hashString(paragraphText) : undefined;
      return ignoredCorrections.some((c) => {
        if (c.ruleId !== ruleId || c.text !== text) return false;
        // Global ignore (no context) matches everything
        if (!c.context) return true;
        // Context-specific ignore requires matching hash
        return c.context === context;
      });
    },
    [ignoredCorrections],
  );

  return {
    ignoredCorrections,
    ignoreCorrection,
    unignoreCorrection,
    isIgnored,
    computeContextHash,
  };
}
