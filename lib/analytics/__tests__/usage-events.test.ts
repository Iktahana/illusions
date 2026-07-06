import { beforeEach, describe, expect, it, vi } from "vitest";

describe("usage analytics facade", () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(window, "electronAPI");
  });

  it("forwards approved anonymous events to the Electron analytics bridge", async () => {
    const trackEvent = vi.fn(async () => undefined);
    Object.defineProperty(window, "electronAPI", {
      value: { analytics: { trackEvent } },
      configurable: true,
    });
    const { trackUsageEvent } = await import("../usage-events");

    trackUsageEvent("project_create_completed", {
      surface: "wizard",
      mode: "project",
      initial_file_type: "mdi",
    });

    expect(trackEvent).toHaveBeenCalledWith("project_create_completed", {
      surface: "wizard",
      mode: "project",
      initial_file_type: "mdi",
    });
  });

  it("drops undefined props before sending", async () => {
    const trackEvent = vi.fn(async () => undefined);
    Object.defineProperty(window, "electronAPI", {
      value: { analytics: { trackEvent } },
      configurable: true,
    });
    const { trackUsageEvent } = await import("../usage-events");

    trackUsageEvent("save_failed", {
      trigger: "manual",
      mode: "standalone",
      target_kind: "file",
      reason: undefined,
    });

    expect(trackEvent).toHaveBeenCalledWith("save_failed", {
      trigger: "manual",
      mode: "standalone",
      target_kind: "file",
    });
  });

  it("does not throw when analytics bridge is unavailable", async () => {
    const { trackUsageEvent } = await import("../usage-events");

    expect(() => {
      trackUsageEvent("auth_login_started", { surface: "settings" });
    }).not.toThrow();
  });

  it("maps raw errors to safe reason enums without exposing messages", async () => {
    const { classifyTelemetryError } = await import("../usage-events");

    expect(
      classifyTelemetryError(Object.assign(new Error("user@example.com"), { code: "ENOENT" })),
    ).toBe("not_found");
    expect(classifyTelemetryError(new Error("/Users/alice/private/chapter.mdi"))).toBe("unknown");
  });

  it("buckets counts instead of sending exact project/file counts", async () => {
    const { bucketTelemetryCount } = await import("../usage-events");

    expect(bucketTelemetryCount(0)).toBe("0");
    expect(bucketTelemetryCount(1)).toBe("1");
    expect(bucketTelemetryCount(4)).toBe("2_5");
    expect(bucketTelemetryCount(8)).toBe("6_10");
    expect(bucketTelemetryCount(12)).toBe("11_plus");
  });

  it("buckets session duration instead of sending exact elapsed time", async () => {
    const { bucketSessionDuration } = await import("../usage-events");

    expect(bucketSessionDuration(0)).toBe("lt_1m");
    expect(bucketSessionDuration(59_999)).toBe("lt_1m");
    expect(bucketSessionDuration(60_000)).toBe("1_5m");
    expect(bucketSessionDuration(5 * 60_000 - 1)).toBe("1_5m");
    expect(bucketSessionDuration(5 * 60_000)).toBe("5_15m");
    expect(bucketSessionDuration(15 * 60_000 - 1)).toBe("5_15m");
    expect(bucketSessionDuration(15 * 60_000)).toBe("15_60m");
    expect(bucketSessionDuration(60 * 60_000 - 1)).toBe("15_60m");
    expect(bucketSessionDuration(60 * 60_000)).toBe("gte_60m");
  });

  it("normalizes file extensions without preserving filenames", async () => {
    const { normalizeTelemetryFileType } = await import("../usage-events");

    expect(normalizeTelemetryFileType(".mdi")).toBe("mdi");
    expect(normalizeTelemetryFileType("chapter.mdi")).toBe("unknown");
    expect(normalizeTelemetryFileType(".markdown")).toBe("unknown");
  });

  it("maps save outcomes to safe reason enums", async () => {
    const { classifySaveOutcome } = await import("../usage-events");

    expect(classifySaveOutcome({ status: "cancelled" })).toBe("cancelled");
    expect(classifySaveOutcome({ status: "conflicted" })).toBe("conflict");
    expect(classifySaveOutcome({ status: "locked" })).toBe("locked");
    expect(classifySaveOutcome({ status: "failed", error: new Error("/tmp/private.mdi") })).toBe(
      "unknown",
    );
  });

  it("derives target kind from anonymous file descriptor shape only", async () => {
    const { getTelemetryTargetKind } = await import("../usage-events");

    expect(getTelemetryTargetKind(null)).toBe("untitled");
    expect(getTelemetryTargetKind({ path: "/Users/alice/private.mdi", handle: null })).toBe("file");
    expect(getTelemetryTargetKind({ path: null, handle: {} })).toBe("handle");
  });
});
