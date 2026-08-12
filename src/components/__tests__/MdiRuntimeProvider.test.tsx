import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ initialize: vi.fn<() => Promise<void>>() }));

vi.mock("@/lib/document-format", () => ({
  getDocumentAdapter: vi.fn(() => ({ initialize: mocks.initialize })),
}));

import { MdiRuntimeProvider } from "../MdiRuntimeProvider";

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  mocks.initialize.mockReset();
  document.body.replaceChildren();
});

function renderProvider(): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<MdiRuntimeProvider>editor ready</MdiRuntimeProvider>));
}

describe("MdiRuntimeProvider", () => {
  it("does not render synchronous MDI consumers before WASM is ready", async () => {
    let resolveInitialization: (() => void) | undefined;
    mocks.initialize.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveInitialization = resolve;
      }),
    );

    renderProvider();
    expect(document.body.textContent).toContain("エディターを準備しています");
    expect(document.body.textContent).not.toContain("editor ready");

    await act(async () => resolveInitialization?.());
    expect(document.body.textContent).toContain("editor ready");
  });

  it("allows a transient initialization failure to be retried", async () => {
    let resolveRetry: (() => void) | undefined;
    mocks.initialize
      .mockRejectedValueOnce(new Error("temporary fetch failure"))
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
      );

    renderProvider();
    await act(async () => Promise.resolve());

    const retry = document.querySelector("button");
    expect(retry?.textContent).toContain("再試行");
    act(() => retry?.click());
    expect(mocks.initialize).toHaveBeenCalledTimes(2);

    await act(async () => resolveRetry?.());
    expect(document.body.textContent).toContain("editor ready");
  });
});
