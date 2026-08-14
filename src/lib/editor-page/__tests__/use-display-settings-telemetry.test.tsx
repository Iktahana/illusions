import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { persistAppState } = vi.hoisted(() => ({
  persistAppState: vi.fn<(value: Record<string, unknown>) => Promise<void>>(),
}));

vi.mock("@/lib/storage/app-state-manager", () => ({ persistAppState }));

import { useDisplaySettings } from "../use-display-settings";

const latest: { current: ReturnType<typeof useDisplaySettings> | null } = { current: null };

function Harness(): null {
  // eslint-disable-next-line react-hooks/immutability -- test harness publishes hook actions
  latest.current = useDisplaySettings(vi.fn());
  return null;
}

describe("display settings telemetry", () => {
  let root: Root;
  let container: HTMLDivElement;
  const trackEvent = vi.fn(async () => undefined);

  beforeEach(async () => {
    vi.useFakeTimers();
    persistAppState.mockReset();
    persistAppState.mockResolvedValue(undefined);
    trackEvent.mockClear();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { analytics: { trackEvent } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(window, "electronAPI");
    vi.useRealTimers();
  });

  it("reports only after persistence succeeds", async () => {
    await act(async () => latest.current?.displayHandlers.handleAutoSaveChange(false));

    expect(trackEvent).toHaveBeenCalledWith("settings_change_completed", {
      category: "typography",
      setting: "autosave",
      action: "disabled",
    });

    trackEvent.mockClear();
    persistAppState.mockRejectedValueOnce(new Error("storage unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => latest.current?.displayHandlers.handleAutoSaveChange(true));

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("coalesces continuous typography changes for one second", async () => {
    await act(async () => {
      latest.current?.displayHandlers.handleFontScaleChange(101);
      latest.current?.displayHandlers.handleFontScaleChange(102);
      latest.current?.displayHandlers.handleLineHeightChange(2);
    });

    expect(trackEvent).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(trackEvent).toHaveBeenCalledOnce();
  });
});
