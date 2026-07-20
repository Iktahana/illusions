// lib/tab-manager/__tests__/terminal-label.test.ts
import { describe, it, expect } from "vitest";

import { nextTerminalLabel } from "@/lib/tab-manager/terminal-label";

/**
 * Regression test for PR #1425 / issue #1473.
 *
 * `newTerminalTab` in use-tab-state.ts uses nextTerminalLabel to allocate
 * sequential tab titles. This test exercises the same production helper
 * to ensure the numbering contract does not silently regress to a fixed
 * "ターミナル" label or to indices starting at 0.
 */
describe("nextTerminalLabel", () => {
  it("returns 'ターミナル 1' on the first call when counter starts at 0", () => {
    const counter = { current: 0 };
    expect(nextTerminalLabel(counter)).toBe("ターミナル 1");
  });

  it("increments sequentially across calls with the same counter", () => {
    const counter = { current: 0 };
    expect(nextTerminalLabel(counter)).toBe("ターミナル 1");
    expect(nextTerminalLabel(counter)).toBe("ターミナル 2");
    expect(nextTerminalLabel(counter)).toBe("ターミナル 3");
  });

  it("mutates counter.current as a side effect", () => {
    const counter = { current: 4 };
    nextTerminalLabel(counter);
    expect(counter.current).toBe(5);
  });

  it("uses an ASCII space and Japanese 'ターミナル' prefix (label format contract)", () => {
    const counter = { current: 0 };
    const label = nextTerminalLabel(counter);
    expect(label).toMatch(/^ターミナル \d+$/);
  });
});
