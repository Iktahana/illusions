import type { MdiFileDescriptor } from "./mdi-file";

/** Unique identifier for a tab */
export type TabId = string;

/** Runtime state of a single editor tab */
export interface TabState {
  id: TabId;
  file: MdiFileDescriptor | null;
  content: string;
  lastSavedContent: string;
  isDirty: boolean;
  lastSavedTime: number | null;
  isSaving: boolean;
  isPreview: boolean;
}

/** Serialized tab for persistence (file path only, no handles) */
export interface SerializedTab {
  filePath: string | null;
  fileName: string;
  isPreview?: boolean;
}

/** Persisted state for open tabs (stored in AppState) */
export interface TabPersistenceState {
  tabs: SerializedTab[];
  activeIndex: number;
}
