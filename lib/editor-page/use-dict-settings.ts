/**
 * Dictionary settings hook — manages dict-related AppState fields.
 * Follows the same pattern as use-ai-settings.ts.
 */
import { useCallback, useState } from "react";
import { persistAppState } from "@/lib/storage/app-state-manager";

export interface DictSettings {
  dictAutoCheckUpdates: boolean;
  dictAutoDownload: boolean;
  dictInstalledVersion: string | undefined;
  dictLastCheckedAt: string | undefined;
}

export interface DictSettingsHandlers {
  handleDictAutoCheckUpdatesChange: (value: boolean) => void;
  handleDictAutoDownloadChange: (value: boolean) => void;
  handleDictInstalledVersionChange: (version: string | undefined) => void;
  handleDictLastCheckedAtChange: (timestamp: string | undefined) => void;
}

export interface UseDictSettingsResult {
  dictSettings: DictSettings;
  dictHandlers: DictSettingsHandlers;
  applyPersistedDictSettings: (appState: Record<string, unknown>) => void;
}

export function useDictSettings(): UseDictSettingsResult {
  const [dictAutoCheckUpdates, setDictAutoCheckUpdates] = useState(true);
  const [dictAutoDownload, setDictAutoDownload] = useState(false);
  const [dictInstalledVersion, setDictInstalledVersion] = useState<string | undefined>(undefined);
  const [dictLastCheckedAt, setDictLastCheckedAt] = useState<string | undefined>(undefined);

  const applyPersistedDictSettings = useCallback((appState: Record<string, unknown>) => {
    if (typeof appState.dictAutoCheckUpdates === "boolean") {
      setDictAutoCheckUpdates(appState.dictAutoCheckUpdates);
    }
    if (typeof appState.dictAutoDownload === "boolean") {
      setDictAutoDownload(appState.dictAutoDownload);
    }
    if (typeof appState.dictInstalledVersion === "string") {
      setDictInstalledVersion(appState.dictInstalledVersion);
    }
    if (typeof appState.dictLastCheckedAt === "string") {
      setDictLastCheckedAt(appState.dictLastCheckedAt);
    }
  }, []);

  const handleDictAutoCheckUpdatesChange = useCallback((value: boolean) => {
    setDictAutoCheckUpdates(value);
    void persistAppState({ dictAutoCheckUpdates: value });
  }, []);

  const handleDictAutoDownloadChange = useCallback((value: boolean) => {
    setDictAutoDownload(value);
    void persistAppState({ dictAutoDownload: value });
  }, []);

  const handleDictInstalledVersionChange = useCallback((version: string | undefined) => {
    setDictInstalledVersion(version);
    if (version !== undefined) {
      void persistAppState({ dictInstalledVersion: version });
    }
  }, []);

  const handleDictLastCheckedAtChange = useCallback((timestamp: string | undefined) => {
    setDictLastCheckedAt(timestamp);
    if (timestamp !== undefined) {
      void persistAppState({ dictLastCheckedAt: timestamp });
    }
  }, []);

  const dictSettings: DictSettings = {
    dictAutoCheckUpdates,
    dictAutoDownload,
    dictInstalledVersion,
    dictLastCheckedAt,
  };

  const dictHandlers: DictSettingsHandlers = {
    handleDictAutoCheckUpdatesChange,
    handleDictAutoDownloadChange,
    handleDictInstalledVersionChange,
    handleDictLastCheckedAtChange,
  };

  return { dictSettings, dictHandlers, applyPersistedDictSettings };
}
