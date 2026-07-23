import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RECENT_PROJECTS_LOAD_TIMEOUT_MS, useRecentProjects } from "../use-recent-projects";

const { getRecentProjectsMock } = vi.hoisted(() => ({
  getRecentProjectsMock: vi.fn(),
}));

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({ getRecentProjects: getRecentProjectsMock }),
}));

vi.mock("@/lib/project/project-manager", () => ({
  getProjectManager: () => ({ listProjectHandles: vi.fn() }),
}));

function Harness({ onNoRestore }: { onNoRestore: () => void }): null {
  useRecentProjects(true, false, onNoRestore);
  return null;
}

describe("useRecentProjects startup timeout", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getRecentProjectsMock.mockReturnValue(new Promise(() => undefined));
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    consoleError.mockRestore();
    vi.useRealTimers();
  });

  it("releases the startup screen when the recent-projects IPC never settles", async () => {
    const onNoRestore = vi.fn();

    await act(async () => {
      root.render(<Harness onNoRestore={onNoRestore} />);
    });
    expect(onNoRestore).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECENT_PROJECTS_LOAD_TIMEOUT_MS);
    });

    expect(onNoRestore).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to load recent projects:",
      expect.objectContaining({ message: "Recent projects startup load timed out" }),
    );
  });

  it("does not update startup state after the hook has unmounted", async () => {
    const onNoRestore = vi.fn();

    await act(async () => {
      root.render(<Harness onNoRestore={onNoRestore} />);
      root.unmount();
    });
    await vi.advanceTimersByTimeAsync(RECENT_PROJECTS_LOAD_TIMEOUT_MS);

    expect(onNoRestore).not.toHaveBeenCalled();
  });
});
