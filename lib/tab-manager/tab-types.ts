import type { MdiFileDescriptor } from "../project/mdi-file";
import type { SupportedFileExtension } from "../project/project-types";

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
  /** Whether the most recent save was an auto-save (used to suppress toast). */
  lastSaveWasAuto: boolean;
  isSaving: boolean;
  isPreview: boolean;
  fileType: SupportedFileExtension;
}

/** Serialized tab for persistence (file path only, no handles) */
export interface SerializedTab {
  filePath: string | null;
  fileName: string;
  isPreview?: boolean;
  fileType?: SupportedFileExtension;
}

/** Persisted state for open tabs (stored in AppState) */
export interface TabPersistenceState {
  tabs: SerializedTab[];
  activeIndex: number;
}
