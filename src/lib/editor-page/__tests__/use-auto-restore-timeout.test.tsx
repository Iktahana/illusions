import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTO_RESTORE_TIMEOUT_MS, useAutoRestore } from "../use-auto-restore";

const { trackUsageEventMock } = vi.hoisted(() => ({
  trackUsageEventMock: vi.fn(),
}));

vi.mock("@/lib/analytics/usage-events", () => ({
  trackUsageEvent: trackUsageEventMock,
}));

function Harness({
  openProject,
  setIsRestoring,
  setRestoreError,
  signalVfsReady,
}: {
  openProject: (projectId: string) => Promise<boolean>;
  setIsRestoring: React.Dispatch<React.SetStateAction<boolean>>;
  setRestoreError: React.Dispatch<React.SetStateAction<string | null>>;
  signalVfsReady: () => void;
}): null {
  useAutoRestore({
    autoRestoreProjectId: "project-1",
    isElectron: true,
    isAutoRestoringRef: { current: false },
    setIsRestoring,
    setRestoreError,
    signalVfsReady,
    handleOpenRecentProject: openProject,
  });
  return null;
}

describe("useAutoRestore timeout", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("releases the startup screen when restoring a project never settles", async () => {
    const openProject = vi.fn(() => new Promise<boolean>(() => undefined));
    const setIsRestoring = vi.fn((update: React.SetStateAction<boolean>) => {
      if (typeof update === "function") update(true);
    });
    const setRestoreError = vi.fn();
    const signalVfsReady = vi.fn();

    await act(async () => {
      root.render(
        <Harness
          openProject={openProject}
          setIsRestoring={setIsRestoring}
          setRestoreError={setRestoreError}
          signalVfsReady={signalVfsReady}
        />,
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_RESTORE_TIMEOUT_MS + 200);
    });

    expect(signalVfsReady).toHaveBeenCalledOnce();
    expect(setRestoreError).toHaveBeenCalledWith(
      "前回のプロジェクトの復元がタイムアウトしました。プロジェクトを開き直してください。",
    );
    expect(setIsRestoring).toHaveBeenCalled();
    expect(trackUsageEventMock).toHaveBeenCalledWith("project_auto_restore_failed", {
      reason: "timeout",
    });
  });
});
