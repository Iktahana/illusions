import { useCallback, useRef } from "react";
import type {
  EditorInteractionHandle,
  ExistingRubySelection,
  RubyApplicationSegment,
  SelectionToken,
} from "@/lib/editor-interaction";
import type { RubyDialogResult } from "./ruby-dialog-contract";

interface PendingRubyRequest {
  handle: EditorInteractionHandle;
  token: SelectionToken;
  selectedText: string;
  existingRuby: ExistingRubySelection | null;
}

interface UseRubyTcyOptions {
  getInteraction: () => EditorInteractionHandle | null;
  setRubySelectedText: (text: string) => void;
  setRubyInitialSelection: (selection: ExistingRubySelection | null) => void;
  setShowRubyDialog: (show: boolean) => void;
}

export function useRubyTcy({
  getInteraction,
  setRubySelectedText,
  setRubyInitialSelection,
  setShowRubyDialog,
}: UseRubyTcyOptions) {
  const pendingRubyRequestRef = useRef<PendingRubyRequest | null>(null);

  const clearRubyDialogState = useCallback(() => {
    pendingRubyRequestRef.current = null;
    setRubySelectedText("");
    setRubyInitialSelection(null);
    setShowRubyDialog(false);
  }, [setRubyInitialSelection, setRubySelectedText, setShowRubyDialog]);

  const applyRubyResult = useCallback(
    (result: Exclude<RubyDialogResult, null>) => {
      const pending = pendingRubyRequestRef.current;
      clearRubyDialogState();
      if (!pending) return;
      pending.handle.execute(
        result.action === "remove"
          ? { id: "format.ruby", mode: "remove" }
          : { id: "format.ruby", mode: "apply", segments: result.segments },
        pending.token,
      );
    },
    [clearRubyDialogState],
  );

  const handleOpenRubyDialog = useCallback(
    async (
      interactionOverride?: EditorInteractionHandle | null,
      tokenOverride?: SelectionToken,
    ) => {
      const handle = interactionOverride ?? getInteraction();
      if (!handle) return;
      const snapshot = handle.getSnapshot();
      if (!snapshot.availability["format.ruby"]) return;
      const token = tokenOverride ?? snapshot.selection.token;
      const selectedText = snapshot.selection.ruby?.base ?? snapshot.selection.text;
      if (!selectedText.trim()) return;

      const request: PendingRubyRequest = {
        handle,
        token,
        selectedText,
        existingRuby: snapshot.selection.ruby,
      };
      pendingRubyRequestRef.current = request;

      if (window.electronAPI?.openRubyDialog) {
        try {
          const result = await window.electronAPI.openRubyDialog({
            selectedText,
            existingRuby: snapshot.selection.ruby,
          });
          if (pendingRubyRequestRef.current !== request) return;
          if (result) applyRubyResult(result);
          else clearRubyDialogState();
          return;
        } catch {
          // Fall through to the in-page dialog below.
        }
      }

      setRubySelectedText(selectedText);
      setRubyInitialSelection(snapshot.selection.ruby);
      setShowRubyDialog(true);
    },
    [
      applyRubyResult,
      clearRubyDialogState,
      getInteraction,
      setRubyInitialSelection,
      setRubySelectedText,
      setShowRubyDialog,
    ],
  );

  const handleApplyRuby = useCallback(
    (result: Exclude<RubyDialogResult, null>) => {
      applyRubyResult(result);
    },
    [applyRubyResult],
  );

  return {
    handleOpenRubyDialog,
    handleApplyRuby,
    handleCloseRubyDialog: clearRubyDialogState,
  };
}

export type { RubyApplicationSegment };
