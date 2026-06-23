import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadAppStateMock, trackEventMock } = vi.hoisted(() => ({
  loadAppStateMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("@aptabase/electron/main", () => ({
  trackEvent: trackEventMock,
}));

type TrackEventHandler = (_event: unknown, eventName: unknown, props?: unknown) => Promise<void>;

async function loadAnalyticsIpc(): Promise<typeof import("../analytics-ipc.js")> {
  vi.resetModules();
  return import("../analytics-ipc.js");
}

async function createHandler(hasAppKey = true): Promise<TrackEventHandler> {
  const mod = await loadAnalyticsIpc();
  return mod.createAnalyticsTrackEventHandler({
    getStorageManager: () => ({ loadAppState: loadAppStateMock }),
    trackEvent: trackEventMock,
    hasAppKey: () => hasAppKey,
  });
}

describe("registerAnalyticsHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APTABASE_APP_KEY = "A-US-test";
    loadAppStateMock.mockResolvedValue({});
    trackEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.APTABASE_APP_KEY;
  });

  it("tracks whitelisted events when analytics consent is enabled", async () => {
    const handler = await createHandler();

    await handler({}, "feature_used", { feature: "export", count: 1 });

    expect(loadAppStateMock).toHaveBeenCalledOnce();
    expect(trackEventMock).toHaveBeenCalledWith("feature_used", { feature: "export", count: 1 });
  });

  it("does not track events when analytics consent is disabled", async () => {
    loadAppStateMock.mockResolvedValue({ usageAnalyticsConsent: false });
    const handler = await createHandler();

    await handler({}, "feature_used", { feature: "export" });

    expect(loadAppStateMock).toHaveBeenCalledOnce();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("does not load app state or track when the app key is unavailable", async () => {
    const handler = await createHandler(false);

    await handler({}, "feature_used", { feature: "export" });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects non-whitelisted props before reading consent", async () => {
    const handler = await createHandler();

    await handler({}, "feature_used", { feature: "export", nested: { path: "/tmp/file.mdi" } });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects empty event names before reading consent", async () => {
    const handler = await createHandler();

    await handler({}, "", { feature: "export" });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });
});
