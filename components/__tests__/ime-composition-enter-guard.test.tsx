/**
 * Regression tests for IME composition Enter guard (#1858).
 *
 * Japanese IME: pressing Enter to confirm a conversion fires a keydown event
 * with isComposing=true (and historically keyCode=229). These tests verify
 * that the three affected handlers ignore composition Enter and only act on
 * real Enter (isComposing=false).
 *
 * Components tested:
 *  1. SearchDialog  — handleKeyDown: Enter → next/prev match
 *  2. FilesPanel    — handleEditKeyDown: Enter → submit rename/new-file name
 *  3. CreateProjectWizard — handleNameKeyDown: Enter → trigger project creation
 *
 * Uses jsdom + react-dom/client (no @testing-library/react in this project).
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// ---------------------------------------------------------------------------
// Mock heavy service dependencies before importing components
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({
    isRootOpen: () => true,
    listDirectory: async () => [],
    getRootPath: () => "/test",
    rename: async () => {},
    deleteFile: async () => {},
    writeFile: async () => {},
    getDirectoryHandle: async () => ({}),
    newFile: async () => {},
    createDirectory: async () => {},
  }),
}));

vi.mock("@/lib/project/project-service", () => ({
  getProjectService: () => ({
    createProject: vi.fn().mockResolvedValue({ name: "test" }),
  }),
  validateProjectName: (name: string) => ({ valid: name.length > 0 }),
}));

// GlassDialog uses a keydown listener on document — keep it simple via no-op mock
// Actually GlassDialog is a simple wrapper, no need to mock it.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dispatch a synthetic-compatible keyboard event.
 * React reads e.nativeEvent.isComposing from the underlying DOM event.
 * KeyboardEventInit supports isComposing since DOM Level 3.
 */
function dispatchKeydown(
  element: Element,
  key: string,
  options: { isComposing?: boolean; keyCode?: number; shiftKey?: boolean } = {},
): void {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: options.isComposing ?? false,
    shiftKey: options.shiftKey ?? false,
    // keyCode is deprecated but some handlers check it as a fallback
    ...(options.keyCode !== undefined ? { keyCode: options.keyCode } : {}),
  });
  element.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// 1. SearchDialog — Enter should not navigate during IME composition
// ---------------------------------------------------------------------------

describe("SearchDialog — IME composition Enter guard (#1858)", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderDialog(onIndexChange: (i: number) => void) {
    const { default: SearchDialog } = await import("../SearchDialog");
    await act(async () => {
      root.render(
        <SearchDialog
          isOpen={true}
          onClose={() => {}}
          searchTerm="テスト"
          onSearchTermChange={() => {}}
          caseSensitive={false}
          onCaseSensitiveChange={() => {}}
          matches={[
            { from: 0, to: 4 },
            { from: 10, to: 14 },
          ]}
          currentMatchIndex={0}
          onCurrentMatchIndexChange={onIndexChange}
        />,
      );
    });
  }

  it("does NOT navigate on Enter when isComposing=true", async () => {
    const onIndexChange = vi.fn();
    await renderDialog(onIndexChange);

    // Find the dialog container rendered into the portal (document.body)
    const dialog = document.querySelector('[class*="fixed"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();

    act(() => {
      dispatchKeydown(dialog!, "Enter", { isComposing: true });
    });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("does NOT navigate on Enter when keyCode=229 (legacy IME)", async () => {
    const onIndexChange = vi.fn();
    await renderDialog(onIndexChange);

    const dialog = document.querySelector('[class*="fixed"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();

    act(() => {
      dispatchKeydown(dialog!, "Enter", { keyCode: 229 });
    });

    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("navigates to next match on real Enter (isComposing=false)", async () => {
    const onIndexChange = vi.fn();
    await renderDialog(onIndexChange);

    const dialog = document.querySelector('[class*="fixed"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();

    act(() => {
      dispatchKeydown(dialog!, "Enter", { isComposing: false });
    });

    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("navigates to previous match on real Shift+Enter", async () => {
    const onIndexChange = vi.fn();
    await renderDialog(onIndexChange);

    const dialog = document.querySelector('[class*="fixed"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();

    act(() => {
      dispatchKeydown(dialog!, "Enter", { isComposing: false, shiftKey: true });
    });

    // currentMatchIndex=0, matches.length=2 → (0 - 1 + 2) % 2 = 1
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// 2. FilesPanel — inline edit Enter should not submit during IME composition
// ---------------------------------------------------------------------------

describe("FilesPanel — IME composition Enter guard (#1858)", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderFilesPanel(newFileTrigger: number) {
    const { FilesPanel } = await import("../explorer/FilesPanel");
    await act(async () => {
      root.render(<FilesPanel projectName="test-project" newFileTrigger={newFileTrigger} />);
    });
    // Allow async effects (loadDirectory → isRootOpen returns false → tree=null)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  async function getEditInput(): Promise<HTMLInputElement | null> {
    return container.querySelector("input") as HTMLInputElement | null;
  }

  it("does NOT submit on Enter when isComposing=true", async () => {
    // Start at 0 then trigger new-file with trigger=1
    await renderFilesPanel(0);

    // Increment trigger to activate inline edit mode
    const { FilesPanel } = await import("../explorer/FilesPanel");
    await act(async () => {
      root.render(<FilesPanel projectName="test-project" newFileTrigger={1} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const input = await getEditInput();
    expect(input).not.toBeNull();

    // Spy on handleRename via the file service mock (rename won't be called if guard works)
    // Instead, check that the input remains in the DOM (editing not cleared on bad Enter)
    act(() => {
      dispatchKeydown(input!, "Enter", { isComposing: true });
    });

    // Input should still be present — editing state was not cleared
    const inputAfter = await getEditInput();
    expect(inputAfter).not.toBeNull();
  });

  it("submits (clears input) on real Enter (isComposing=false)", async () => {
    await renderFilesPanel(0);

    const { FilesPanel } = await import("../explorer/FilesPanel");
    await act(async () => {
      root.render(<FilesPanel projectName="test-project" newFileTrigger={1} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const input = await getEditInput();
    expect(input).not.toBeNull();

    await act(async () => {
      dispatchKeydown(input!, "Enter", { isComposing: false });
      await new Promise((r) => setTimeout(r, 0));
    });

    // After real Enter, handleEditSubmit is called and setEditing(null) is called on success
    // (handleNewFile calls setEditing(null) inside). The input should be gone.
    // NOTE: because the VFS mock returns immediately, the async path completes and editing clears.
    const inputAfter = await getEditInput();
    expect(inputAfter).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. CreateProjectWizard — name field Enter should not create project during IME
// ---------------------------------------------------------------------------

describe("CreateProjectWizard — IME composition Enter guard (#1858)", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderWizard(onProjectCreated: () => void) {
    const { default: CreateProjectWizard } = await import("../CreateProjectWizard");
    await act(async () => {
      root.render(
        <CreateProjectWizard
          isOpen={true}
          onClose={() => {}}
          onProjectCreated={onProjectCreated}
        />,
      );
    });
  }

  function getNameInput(): HTMLInputElement | null {
    // The wizard renders an input for the project name
    return container.querySelector(
      'input[type="text"], input:not([type])',
    ) as HTMLInputElement | null;
  }

  it("does NOT create project on Enter when isComposing=true", async () => {
    const onProjectCreated = vi.fn();
    await renderWizard(onProjectCreated);

    const input = getNameInput();
    expect(input).not.toBeNull();

    // Type a valid name so the guard condition is met
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input!,
        "テストプロジェクト",
      );
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      dispatchKeydown(input!, "Enter", { isComposing: true });
    });

    // Still on step 1 — project not created
    expect(onProjectCreated).not.toHaveBeenCalled();
    // Wizard still shows step 1 (name input still visible)
    expect(getNameInput()).not.toBeNull();
  });

  it("does NOT create project on Enter when keyCode=229", async () => {
    const onProjectCreated = vi.fn();
    await renderWizard(onProjectCreated);

    const input = getNameInput();
    expect(input).not.toBeNull();

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input!,
        "テストプロジェクト",
      );
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      dispatchKeydown(input!, "Enter", { keyCode: 229 });
    });

    expect(onProjectCreated).not.toHaveBeenCalled();
    expect(getNameInput()).not.toBeNull();
  });

  it("initiates project creation on real Enter (isComposing=false) with valid name", async () => {
    const onProjectCreated = vi.fn();
    await renderWizard(onProjectCreated);

    const input = getNameInput();
    expect(input).not.toBeNull();

    // Set projectName state — React controls this via onChange, but we need to set the
    // controlled state. The wizard uses an uncontrolled input? Let's check:
    // CreateProjectWizard uses useState + onChange, so we dispatch a change event.
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input!,
        "テストプロジェクト",
      );
      input!.dispatchEvent(new Event("input", { bubbles: true }));
      input!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      dispatchKeydown(input!, "Enter", { isComposing: false });
      // Allow async project creation to proceed
      await new Promise((r) => setTimeout(r, 0));
    });

    // handleCreate sets step to "creating" — the name input should no longer be on step 1
    // (wizard moves to creating step, input disappears or changes)
    // We verify that the step changed (name input is no longer the first thing visible)
    // OR that onProjectCreated will eventually be called. Since mock resolves immediately:
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });

    expect(onProjectCreated).toHaveBeenCalled();
  });
});
