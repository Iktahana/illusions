import { computeTextStatistics } from "@/lib/editor-page/text-statistics";
import type { SupportedFileExtension } from "@/lib/project/project-types";
import type { EditorInteractionSnapshot } from "./types";

export interface ActiveSelectionStats {
  selectedCharCount: number;
  selectedManuscriptCells: number;
  selectedManuscriptPages: number;
  searchSelectionRange: { from: number; to: number } | null;
}

const EMPTY_SELECTION_STATS: ActiveSelectionStats = Object.freeze({
  selectedCharCount: 0,
  selectedManuscriptCells: 0,
  selectedManuscriptPages: 0,
  searchSelectionRange: null,
});

/**
 * Compute inspector/search selection state from the active interaction snapshot.
 *
 * The interaction snapshot already exposes visible editor text, so selection
 * statistics must treat it as plain text regardless of the backing file type:
 * markdown / MDI markup has already been resolved by ProseMirror.
 */
export function computeActiveSelectionStats(
  snapshot: EditorInteractionSnapshot | null,
  _fileType: SupportedFileExtension,
): ActiveSelectionStats {
  if (!snapshot || !snapshot.ready || !snapshot.active || snapshot.composing) {
    return EMPTY_SELECTION_STATS;
  }

  const { selection } = snapshot;
  if (
    selection.kind === "none" ||
    selection.kind === "caret" ||
    selection.from >= selection.to ||
    !selection.text
  ) {
    return EMPTY_SELECTION_STATS;
  }

  const textStats = computeTextStatistics(selection.text, ".txt");
  return {
    selectedCharCount: textStats.visibleTextCharCount,
    selectedManuscriptCells: textStats.manuscriptCellCount,
    selectedManuscriptPages: textStats.manuscriptPages,
    searchSelectionRange: { from: selection.from, to: selection.to },
  };
}

export function emptyActiveSelectionStats(): ActiveSelectionStats {
  return EMPTY_SELECTION_STATS;
}
