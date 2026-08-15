import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorCommandId } from "@/lib/editor-interaction";
import { useElectronEvents } from "../use-electron-events";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useElectronEvents editor commands", () => {
  let container: HTMLDivElement;
  let listener: ((command: EditorCommandId) => void) | undefined;
  const cleanup = vi.fn();
  const onMenuEditorCommand = vi.fn((next: (command: EditorCommandId) => void) => {
    listener = next;
    return cleanup;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    listener = undefined;
    cleanup.mockClear();
    onMenuEditorCommand.mockClear();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { onMenuEditorCommand },
    });
  });

  afterEach(() => {
    container.remove();
    Object.defineProperty(window, "electronAPI", { configurable: true, value: undefined });
  });

  it("forwards allowlisted native menu commands and removes the listener", () => {
    const handleExecuteEditorCommand = vi.fn();
    const root = createRoot(container);
    function Harness(): null {
      useElectronEvents({ isElectron: true, handleExecuteEditorCommand } as never);
      return null;
    }

    act(() => root.render(<Harness />));
    act(() => listener?.("speech.toggle"));
    expect(handleExecuteEditorCommand).toHaveBeenCalledWith("speech.toggle");

    act(() => root.unmount());
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
