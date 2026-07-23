import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import StartupRestoreScreen from "../StartupRestoreScreen";

describe("StartupRestoreScreen", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows an accessible recovery state instead of an indistinguishable blank screen", async () => {
    await act(async () => {
      root.render(<StartupRestoreScreen />);
    });

    expect(container.querySelector('[data-testid="startup-restore-screen"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
    expect(container.textContent).toContain("前回の作業状態を復元しています");
    expect(container.textContent).toContain("しばらくお待ちください");
  });
});
