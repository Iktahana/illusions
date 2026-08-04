import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import KeymapSettingsTab from "../KeymapSettingsTab";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const keyboardInputSettingsMock = vi.fn();
const isMacOSMock = vi.fn();

vi.mock("../KeymapSettings", () => ({ default: () => null }));
vi.mock("@/contexts/EditorSettingsContext", () => ({
  useKeyboardInputSettings: () => keyboardInputSettingsMock(),
}));
vi.mock("@/lib/utils/runtime-env", () => ({
  isMacOS: () => isMacOSMock(),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  keyboardInputSettingsMock.mockReturnValue({
    allowOptionKeySpecialCharacterInput: false,
    onAllowOptionKeySpecialCharacterInputChange: vi.fn(),
  });
  isMacOSMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("KeymapSettingsTab", () => {
  it("shows the Option character-input setting on macOS", async () => {
    isMacOSMock.mockReturnValue(true);

    await act(async () => {
      root.render(<KeymapSettingsTab />);
    });

    expect(container.querySelector("#allow-option-key-special-character-input")).not.toBeNull();
  });

  it("hides the Option character-input setting outside macOS", async () => {
    isMacOSMock.mockReturnValue(false);

    await act(async () => {
      root.render(<KeymapSettingsTab />);
    });

    expect(container.querySelector("#allow-option-key-special-character-input")).toBeNull();
  });
});
