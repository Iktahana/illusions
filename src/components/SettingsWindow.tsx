"use client";

import { useCallback } from "react";

import SettingsModal from "@/components/SettingsModal";
import { EditorSettingsProvider } from "@/contexts/EditorSettingsContext";
import { useEditorSettings } from "@/lib/editor-page/use-editor-settings";
import type { SettingsCategory } from "@/components/SettingsModal";

function getInitialCategory(): SettingsCategory | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("settings-category") as
    SettingsCategory | undefined;
}

/**
 * Content for the global Settings BrowserWindow (#2166).
 *
 * The same editor-settings hook subscribes to canonical AppState snapshots,
 * so changes made here are reflected live in every editor window.
 */
export default function SettingsWindow(): React.JSX.Element {
  const incrementEditorKey = useCallback(() => {}, []);
  const { settings, handlers } = useEditorSettings(incrementEditorKey);

  return (
    <EditorSettingsProvider settings={settings} handlers={handlers}>
      <SettingsModal
        isOpen
        presentation="window"
        scope="global"
        initialCategory={getInitialCategory()}
        onClose={() => window.close()}
      />
    </EditorSettingsProvider>
  );
}
