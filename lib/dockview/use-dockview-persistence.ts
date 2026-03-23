"use client";

/**
 * Dockview layout persistence — saves/restores the split-pane layout.
 *
 * Uses the existing StorageService AppState for persistence.
 * Layout is serialized via dockview's toJSON() and stored alongside
 * the existing openTabs field for backward compatibility.
 */

import { useEffect, useRef } from "react";
import type { DockviewApi } from "dockview-react";
import type { DockviewLayoutState } from "./types";
import { getStorageService } from "@/lib/storage/storage-service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYOUT_PERSIST_DEBOUNCE = 2000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDockviewPersistenceOptions {
  dockviewApi: DockviewApi | null;
  enabled?: boolean;
}

export function useDockviewPersistence({
  dockviewApi,
  enabled = true,
}: UseDockviewPersistenceOptions): void {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save layout on changes (debounced)
  useEffect(() => {
    if (!dockviewApi || !enabled) return;

    const disposable = dockviewApi.onDidLayoutChange(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        try {
          const layoutJson = dockviewApi.toJSON();
          const layoutState: DockviewLayoutState = {
            dockviewJson: layoutJson,
            buffers: [], // Buffer metadata managed by tab persistence
          };
          void getStorageService()
            .saveAppState({ dockviewLayout: layoutState })
            .catch((err) => {
              console.warn("[dockview-persistence] Failed to save layout:", err);
            });
        } catch (err) {
          console.warn("[dockview-persistence] Failed to serialize layout:", err);
        }
      }, LAYOUT_PERSIST_DEBOUNCE);
    });

    return () => {
      disposable.dispose();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [dockviewApi, enabled]);
}

// ---------------------------------------------------------------------------
// Utility: load saved layout
// ---------------------------------------------------------------------------

/**
 * Load saved dockview layout from AppState.
 * Returns null if no saved layout exists.
 */
export async function loadDockviewLayout(): Promise<DockviewLayoutState | null> {
  try {
    const appState = await getStorageService().loadAppState();
    return appState?.dockviewLayout ?? null;
  } catch {
    return null;
  }
}
