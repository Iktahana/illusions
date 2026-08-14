"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { EditorInteractionHandle, EditorInteractionSnapshot } from "./types";

const EditorInteractionContext = createContext<EditorInteractionHandle | null>(null);
export const EditorInteractionProvider = EditorInteractionContext.Provider;

export function useEditorInteraction(): {
  handle: EditorInteractionHandle;
  snapshot: EditorInteractionSnapshot;
} {
  const handle = useContext(EditorInteractionContext);
  if (!handle)
    throw new Error("useEditorInteraction must be used inside EditorInteractionProvider");
  return {
    handle,
    snapshot: useSyncExternalStore(handle.subscribe, handle.getSnapshot, handle.getSnapshot),
  };
}
