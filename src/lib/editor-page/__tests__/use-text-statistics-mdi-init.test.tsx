import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

let initialized = false;
let resolveInitialization: (() => void) | undefined;

vi.mock("@illusions-lab/mdi", () => ({
  getMdiTextBlocks: vi.fn((source: string) => {
    if (!initialized) throw new Error("MDI core is not initialized");
    return { blocks: [{ text: source }], diagnostics: [] };
  }),
}));

vi.mock("@/lib/document-format", () => ({
  getDocumentAdapter: vi.fn(() => ({
    initialize: () =>
      new Promise<void>((resolve) => {
        resolveInitialization = () => {
          initialized = true;
          resolve();
        };
      }),
  })),
}));

import { useTextStatistics, type TextStatisticsResult } from "../use-text-statistics";

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  initialized = false;
  resolveInitialization = undefined;
  document.body.replaceChildren();
});

describe("useTextStatistics MDI initialization", () => {
  it("renders an empty projection until the Rust runtime is ready, then recomputes", async () => {
    let latest: TextStatisticsResult | undefined;
    function Host() {
      const statistics = useTextStatistics("本文", ".mdi");
      useEffect(() => {
        latest = statistics;
      }, [statistics]);
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    expect(() => act(() => root?.render(<Host />))).not.toThrow();
    expect(latest?.visibleTextCharCount).toBe(0);

    await act(async () => resolveInitialization?.());
    expect(latest?.visibleTextCharCount).toBe(2);
  });
});
