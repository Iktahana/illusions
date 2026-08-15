import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useElectronEvents } from "../use-electron-events";

describe("useElectronEvents search menu bindings", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unmounted: boolean;
  const callbacks: Record<string, () => void> = {};
  const cleanups = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    unmounted = false;
    vi.clearAllMocks();

    Object.assign(window, {
      electronAPI: {
        onMenuSearch: vi.fn((callback: () => void) => {
          callbacks.search = callback;
          return cleanups[0];
        }),
        onMenuSearchNext: vi.fn((callback: () => void) => {
          callbacks.next = callback;
          return cleanups[1];
        }),
        onMenuSearchPrevious: vi.fn((callback: () => void) => {
          callbacks.previous = callback;
          return cleanups[2];
        }),
        onMenuSearchReplace: vi.fn((callback: () => void) => {
          callbacks.replace = callback;
          return cleanups[3];
        }),
      },
    });
  });

  afterEach(() => {
    if (!unmounted) act(() => root.unmount());
    container.remove();
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    for (const key of Object.keys(callbacks)) delete callbacks[key];
  });

  it("routes native find and replace events and unregisters every listener", () => {
    const handleOpenSearch = vi.fn();
    const handleFindNext = vi.fn();
    const handleFindPrevious = vi.fn();
    const handleOpenReplace = vi.fn();

    function Harness(): null {
      useElectronEvents({
        isElectron: true,
        handlePasteAsPlaintext: vi.fn(),
        handleToggleCompactMode: vi.fn(),
        handleToggleWritingMode: vi.fn(),
        handleExecuteEditorCommand: vi.fn(),
        setLineHeight: vi.fn(),
        setParagraphSpacing: vi.fn(),
        setTextIndent: vi.fn(),
        setCharsPerLine: vi.fn(),
        setShowParagraphNumbers: vi.fn(),
        handleAutoCharsPerLineChange: vi.fn(),
        incrementEditorKey: vi.fn(),
        setThemeMode: vi.fn(),
        compactMode: false,
        showParagraphNumbers: false,
        themeMode: "auto",
        autoCharsPerLine: true,
        hasActiveEditor: true,
        handleOpenProject: vi.fn(),
        handleOpenRecentProject: vi.fn(),
        handleOpenAsProject: vi.fn(),
        handleOpenSearch,
        handleFindNext,
        handleFindPrevious,
        handleOpenReplace,
        confirmBeforeAction: vi.fn(),
        onReportBug: vi.fn(),
      });
      return null;
    }

    act(() => root.render(<Harness />));
    act(() => {
      callbacks.search();
      callbacks.next();
      callbacks.previous();
      callbacks.replace();
    });

    expect(handleOpenSearch).toHaveBeenCalledOnce();
    expect(handleFindNext).toHaveBeenCalledOnce();
    expect(handleFindPrevious).toHaveBeenCalledOnce();
    expect(handleOpenReplace).toHaveBeenCalledOnce();

    act(() => root.unmount());
    unmounted = true;
    for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledOnce();
  });
});
