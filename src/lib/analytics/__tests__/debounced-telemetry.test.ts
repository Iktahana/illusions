import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDebouncedTelemetry } from "../debounced-telemetry";

describe("debounced telemetry", () => {
  const trackEvent = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    trackEvent.mockClear();
    Object.defineProperty(window, "electronAPI", {
      value: { analytics: { trackEvent } },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, "electronAPI");
  });

  it("coalesces repeated changes with the same key into one event", () => {
    const telemetry = createDebouncedTelemetry();

    telemetry.schedule("typography", "settings_change_completed", {
      category: "typography",
      setting: "typography",
      action: "updated",
    });
    vi.advanceTimersByTime(600);
    telemetry.schedule("typography", "settings_change_completed", {
      category: "typography",
      setting: "typography",
      action: "updated",
    });
    vi.advanceTimersByTime(999);

    expect(trackEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(trackEvent).toHaveBeenCalledOnce();
  });

  it("keeps unrelated setting groups independent and can flush safely", () => {
    const telemetry = createDebouncedTelemetry();

    telemetry.schedule("speech", "settings_change_completed", {
      category: "speech",
      setting: "speech",
      action: "updated",
    });
    telemetry.schedule("terminal", "settings_change_completed", {
      category: "terminal",
      setting: "terminal",
      action: "updated",
    });
    telemetry.flush();
    telemetry.flush();

    expect(trackEvent).toHaveBeenCalledTimes(2);
  });
});
