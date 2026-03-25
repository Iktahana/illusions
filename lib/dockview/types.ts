/**
 * Dockview split editor types.
 * Decouples file content (BufferState) from visual layout (dockview panels).
 */

import type { MdiFileDescriptor } from "@/lib/project/mdi-file";
import type { SupportedFileExtension } from "@/lib/project/project-types";
import type { SerializedDockview } from "dockview-react";

// ---------------------------------------------------------------------------
// Buffer (content ownership, shared across panels showing the same file)
// ---------------------------------------------------------------------------

/** Unique identifier for an editor buffer */
export type BufferId = string;

/** Runtime state of a single editor buffer (one per open file/document) */
export interface BufferState {
  id: BufferId;
  file: MdiFileDescriptor | null;
  content: string;
  lastSavedContent: string;
  isDirty: boolean;
  lastSavedTime: number | null;
  lastSaveWasAuto: boolean;
  isSaving: boolean;
  isPreview: boolean;
  fileType: SupportedFileExtension;
}

// ---------------------------------------------------------------------------
// Dockview panel params
// ---------------------------------------------------------------------------

/** Params stored in each dockview panel, linking it to a buffer.
 *  Dynamic fields are passed via updateParameters() to bypass stale closures
 *  (dockview-react captures the component function once per panel). */
export interface EditorPanelParams {
  bufferId: BufferId;
  isPreview: boolean;
  /** Current editor content (active tab buffer) */
  content: string;
  /** Content at last save point (used for non-active panels) */
  lastSavedContent: string;
  /** File path for React key derivation */
  filePath: string;
  /** File extension (".mdi" | ".md" | ".txt") */
  fileType: string;
  /** Monotonic counter to force editor remount */
  editorKey: number;
  /** Currently active tab ID for isActivePanel check */
  activeTabId: string;
}

/** Params for a terminal panel */
export interface TerminalPanelParams {
  sessionId: string;
}

/** Params for a diff panel */
export interface DiffPanelParams {
  sourceTabId: string;
}

// ---------------------------------------------------------------------------
// Layout persistence
// ---------------------------------------------------------------------------

/** Serialized buffer metadata for persistence (no content, just identifiers) */
export interface SerializedBuffer {
  id: BufferId;
  filePath: string | null;
  fileName: string;
  fileType: SupportedFileExtension;
  isPreview: boolean;
}

/** Full layout state persisted to AppState */
export interface DockviewLayoutState {
  /** Dockview's own serialized layout (groups, panels, orientations) */
  dockviewJson: SerializedDockview;
  /** Buffer metadata for each open document */
  buffers: SerializedBuffer[];
}

// ---------------------------------------------------------------------------
// Buffer change event
// ---------------------------------------------------------------------------

/** Emitted when a buffer's content changes */
export interface BufferChangeEvent {
  bufferId: BufferId;
  content: string;
  /** Panel that originated the change (undefined for programmatic changes) */
  sourcePanelId?: string;
}
