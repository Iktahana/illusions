/**
 * Tests for the title-selection logic mirrored from TitleUpdater.tsx.
 *
 * TitleUpdater is a React effects-only component; without @testing-library/react
 * we extract and unit-test the pure title-computation function instead.
 *
 * Covers (#1922):
 * - Electron standalone: fileHandle is null, filePath is set → should show fileName
 * - Web standalone: fileHandle is set, filePath is undefined → should show fileName
 * - Unsaved new tab: both fileHandle and filePath are null/undefined → "新規ファイル"
 * - Project mode: shows project name
 * - Dirty flag: appends " *" to name
 */

import { describe, it, expect } from "vitest";
import type { EditorMode, StandaloneMode, ProjectMode } from "@/lib/project/project-types";
import { isProjectMode, isStandaloneMode } from "@/lib/project/project-types";

// ---------------------------------------------------------------------------
// Extracted title logic (mirrors TitleUpdater.tsx — must stay in sync)
// ---------------------------------------------------------------------------

/**
 * Pure function that replicates the title-name computation from TitleUpdater.tsx.
 * When the component logic changes, this function must be updated to match.
 */
function computeTitle(editorMode: EditorMode, isDirty: boolean): string {
  let name: string;
  if (isProjectMode(editorMode)) {
    name = editorMode.name;
  } else if (isStandaloneMode(editorMode) && (editorMode.fileHandle ?? editorMode.filePath)) {
    name = isDirty ? `${editorMode.fileName} *` : editorMode.fileName;
  } else {
    name = isDirty ? "新規ファイル *" : "新規ファイル";
  }
  return `${name} - illusions`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStandalone(overrides: Partial<StandaloneMode>): StandaloneMode {
  return {
    type: "standalone",
    fileHandle: null,
    fileName: "novel.mdi",
    fileExtension: ".mdi",
    editorSettings: {
      fontScale: 1,
      lineHeight: 1.8,
      paragraphSpacing: 1,
      textIndent: 1,
      fontFamily: "serif",
      charsPerLine: 40,
      showParagraphNumbers: false,
      mdiExtensionsEnabled: true,
      posHighlightEnabled: false,
      posHighlightColors: {},
    },
    ...overrides,
  };
}

function makeProject(): ProjectMode {
  return {
    type: "project",
    projectId: "proj-1",
    name: "春の小説",
    rootHandle: {} as FileSystemDirectoryHandle,
    mainFileHandle: {} as FileSystemFileHandle,
    metadata: {} as ProjectMode["metadata"],
    workspaceState: {} as ProjectMode["workspaceState"],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TitleUpdater — title computation logic", () => {
  // --- #1922 regression: Electron standalone ---
  describe("Electron standalone (fileHandle=null, filePath set)", () => {
    it("shows fileName when filePath is present", () => {
      const mode = makeStandalone({
        fileHandle: null,
        filePath: "/Users/x/standalone-a/same.mdi",
        fileName: "same.mdi",
      });
      expect(computeTitle(mode, false)).toBe("same.mdi - illusions");
    });

    it("appends dirty marker when isDirty=true", () => {
      const mode = makeStandalone({
        fileHandle: null,
        filePath: "/Users/x/draft/novel.mdi",
        fileName: "novel.mdi",
      });
      expect(computeTitle(mode, true)).toBe("novel.mdi * - illusions");
    });

    it("does NOT show '新規ファイル' for an existing Electron file", () => {
      const mode = makeStandalone({
        fileHandle: null,
        filePath: "/Users/x/my-story.mdi",
        fileName: "my-story.mdi",
      });
      const title = computeTitle(mode, false);
      expect(title).not.toContain("新規ファイル");
      expect(title).toContain("my-story.mdi");
    });
  });

  // --- Web standalone (fileHandle present) ---
  describe("Web standalone (fileHandle set, filePath undefined)", () => {
    it("shows fileName when fileHandle is present", () => {
      const mode = makeStandalone({
        fileHandle: {} as FileSystemFileHandle,
        filePath: undefined,
        fileName: "web-novel.mdi",
      });
      expect(computeTitle(mode, false)).toBe("web-novel.mdi - illusions");
    });
  });

  // --- Unsaved new tab ---
  describe("unsaved new tab (fileHandle=null, filePath=undefined)", () => {
    it("shows '新規ファイル' when no file is associated", () => {
      const mode = makeStandalone({
        fileHandle: null,
        filePath: undefined,
        fileName: "新規ファイル",
      });
      expect(computeTitle(mode, false)).toBe("新規ファイル - illusions");
    });

    it("appends dirty marker for unsaved new file", () => {
      const mode = makeStandalone({
        fileHandle: null,
        filePath: undefined,
        fileName: "新規ファイル",
      });
      expect(computeTitle(mode, true)).toBe("新規ファイル * - illusions");
    });
  });

  // --- Project mode ---
  describe("project mode", () => {
    it("shows project name", () => {
      const mode = makeProject();
      expect(computeTitle(mode, false)).toBe("春の小説 - illusions");
    });

    it("project name is not affected by isDirty (no dirty marker in project mode)", () => {
      const mode = makeProject();
      expect(computeTitle(mode, true)).toBe("春の小説 - illusions");
    });
  });

  // --- null mode ---
  describe("null mode (no file open)", () => {
    it("shows '新規ファイル' when mode is null", () => {
      expect(computeTitle(null, false)).toBe("新規ファイル - illusions");
    });
  });
});
