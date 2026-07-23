import { describe, expect, it, vi } from "vitest";

import {
  createMacOptionInputGuardPlugin,
  shouldSuppressMacOptionTextInput,
  suppressMacOptionTextInput,
} from "../mac-option-input-guard";

describe("macOS Option text input guard", () => {
  it("suppresses printable Option output and dead keys", () => {
    expect(shouldSuppressMacOptionTextInput({ altKey: true, key: "√" }, true)).toBe(true);
    expect(shouldSuppressMacOptionTextInput({ altKey: true, key: "Dead" }, true)).toBe(true);
  });

  it("prevents the browser default only for macOS Option text input", () => {
    const preventDefault = vi.fn();

    expect(suppressMacOptionTextInput({ altKey: true, key: "√", preventDefault }, true)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("does not affect ordinary input, bare Option, navigation, or other platforms", () => {
    expect(shouldSuppressMacOptionTextInput({ altKey: false, key: "v" }, true)).toBe(false);
    expect(shouldSuppressMacOptionTextInput({ altKey: true, key: "Alt" }, true)).toBe(false);
    expect(shouldSuppressMacOptionTextInput({ altKey: true, key: "ArrowLeft" }, true)).toBe(false);
    expect(shouldSuppressMacOptionTextInput({ altKey: true, key: "√" }, false)).toBe(false);
  });

  it("does not suppress Option text when the input preference is enabled", () => {
    const plugin = createMacOptionInputGuardPlugin(() => true);
    const keydown = plugin.props.handleDOMEvents?.keydown;
    const preventDefault = vi.fn();

    expect(
      keydown?.call(
        plugin,
        {} as never,
        { altKey: true, key: "√", preventDefault } as unknown as KeyboardEvent,
      ),
    ).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
