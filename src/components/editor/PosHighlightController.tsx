"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { usePosHighlightSettings, usePowerSettings } from "@/contexts/EditorSettingsContext";
import { useEditorInteraction } from "@/lib/editor-interaction/context";
import type { EditorPosHighlightMatch } from "@/lib/editor-interaction";
import { DEFAULT_POS_COLORS } from "@/lib/editor-page/pos-highlight-colors";
import {
  getWindowActivitySnapshot,
  shouldEnablePosHighlight,
  subscribeWindowActivity,
} from "@/lib/editor-page";
import { getPosHighlightCategory } from "@/lib/editor-page/pos-highlight-utils";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";

const POS_HIGHLIGHT_DEBOUNCE_MS = 120;

export default function PosHighlightController(): null {
  const { handle, snapshot } = useEditorInteraction();
  const { posHighlightEnabled, posHighlightColors, posHighlightDisabledTypes } =
    usePosHighlightSettings();
  const { powerSaveMode } = usePowerSettings();
  const activityKey = useSyncExternalStore(
    subscribeWindowActivity,
    () => {
      const activity = getWindowActivitySnapshot();
      return `${activity.isWindowFocused}:${activity.isDocumentVisible}`;
    },
    () => "true:true",
  );
  const activity = useMemo(() => {
    const [isWindowFocused, isDocumentVisible] = activityKey.split(":");
    return {
      isWindowFocused: isWindowFocused === "true",
      isDocumentVisible: isDocumentVisible === "true",
    };
  }, [activityKey]);
  const effectiveEnabled = shouldEnablePosHighlight(activity, {
    posHighlightEnabled,
    powerSaveMode,
  });
  const effectiveColors = useMemo(
    () => ({ ...DEFAULT_POS_COLORS, ...posHighlightColors }),
    [posHighlightColors],
  );

  useEffect(() => {
    if (snapshot.composing) return;

    if (!effectiveEnabled || !snapshot.ready || !snapshot.active) {
      handle.syncPosHighlightPresentation({
        token: null,
        request: null,
        matches: [],
        colors: effectiveColors,
        disabledTypes: posHighlightDisabledTypes,
        visible: false,
      });
      return;
    }

    const request = handle.createPosHighlightRequest();
    if (!request || request.segments.length === 0) {
      handle.syncPosHighlightPresentation({
        token: null,
        request: null,
        matches: [],
        colors: effectiveColors,
        disabledTypes: posHighlightDisabledTypes,
        visible: false,
      });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const results = await getNlpClient().tokenizeDocument(
          request.segments.map((segment, index) => ({ pos: index, text: segment.text })),
        );
        if (cancelled) return;

        const matches: EditorPosHighlightMatch[] = results.flatMap(({ pos, tokens }) =>
          tokens
            .filter((token) => token.end > token.start)
            .map((token) => ({
              segmentIndex: pos,
              start: token.start,
              end: token.end,
              category: getPosHighlightCategory(token),
            })),
        );

        handle.syncPosHighlightPresentation({
          token: request.token,
          request,
          matches,
          colors: effectiveColors,
          disabledTypes: posHighlightDisabledTypes,
          visible: true,
        });
      } catch {
        if (cancelled) return;
        handle.syncPosHighlightPresentation({
          token: null,
          request: null,
          matches: [],
          colors: effectiveColors,
          disabledTypes: posHighlightDisabledTypes,
          visible: false,
        });
      }
    }, POS_HIGHLIGHT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    effectiveColors,
    effectiveEnabled,
    handle,
    posHighlightDisabledTypes,
    snapshot.active,
    snapshot.composing,
    snapshot.generation,
    snapshot.ready,
    snapshot.selection.revision,
  ]);

  return null;
}
