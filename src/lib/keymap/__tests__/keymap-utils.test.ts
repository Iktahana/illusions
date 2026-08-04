import { describe, expect, it } from "vitest";

import { matchesEvent } from "../keymap-utils";

function macOptionEvent(key: string, code: string): KeyboardEvent {
  return {
    key,
    code,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  } as KeyboardEvent;
}

describe("matchesEvent", () => {
  it("matches an Option shortcut by physical key when macOS reports generated text", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });

    try {
      expect(matchesEvent({ modifiers: ["Alt"], key: "v" }, macOptionEvent("√", "KeyV"))).toBe(
        true,
      );
    } finally {
      if (originalPlatform) Object.defineProperty(navigator, "platform", originalPlatform);
    }
  });

  it("also preserves custom Option shortcuts bound to punctuation keys", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });

    try {
      expect(
        matchesEvent({ modifiers: ["Alt"], key: "[" }, macOptionEvent("“", "BracketLeft")),
      ).toBe(true);
    } finally {
      if (originalPlatform) Object.defineProperty(navigator, "platform", originalPlatform);
    }
  });
});
