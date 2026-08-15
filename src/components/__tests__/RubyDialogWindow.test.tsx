import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../RubyDialog", () => ({
  default: ({
    onApply,
    onClose,
  }: {
    onApply: (result: { action: "apply"; segments: Array<{ base: string; ruby: string }> }) => void;
    onClose: () => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onApply({ action: "apply", segments: [{ base: "漢字", ruby: "かんじ" }] });
        onClose();
      }}
    >
      適用
    </button>
  ),
}));

import RubyDialogWindow from "../RubyDialogWindow";

describe("RubyDialogWindow", () => {
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
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    vi.restoreAllMocks();
  });

  it("completes only once when apply is immediately followed by close", async () => {
    const completeRubyDialog = vi.fn(async () => true);
    Object.assign(window, {
      electronAPI: {
        getRubyDialogRequest: vi.fn(async () => ({ selectedText: "漢字", existingRuby: null })),
        completeRubyDialog,
      },
    });

    await act(async () => {
      root.render(<RubyDialogWindow />);
    });
    const applyButton = container.querySelector("button");
    expect(applyButton).not.toBeNull();

    act(() => applyButton?.click());

    expect(completeRubyDialog).toHaveBeenCalledTimes(1);
    expect(completeRubyDialog).toHaveBeenCalledWith({
      action: "apply",
      segments: [{ base: "漢字", ruby: "かんじ" }],
    });
  });
});
