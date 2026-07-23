import { beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const withScopeMock = vi.fn(
  (callback: (scope: { setTag: (key: string, value: string) => void }) => void) =>
    callback({ setTag: vi.fn() }),
);
const captureExceptionMock = vi.fn();
const loadAppStateMock = vi.fn();

async function loadErrorReporting(): Promise<typeof import("../error-reporting.js")> {
  vi.resetModules();
  return import("../error-reporting.js");
}

describe("electron/error-reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAppStateMock.mockResolvedValue({});
  });

  it("does not initialize when DSN is empty", async () => {
    const mod = await loadErrorReporting();

    expect(
      mod.initializeErrorReporting({
        dsn: "",
        getStorageManager: () => ({ loadAppState: loadAppStateMock }),
        getRelease: () => "1.2.0",
        sentryMainModule: {
          init: initMock,
          withScope: withScopeMock,
          captureException: captureExceptionMock,
        },
      }),
    ).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
  });

  it("initializes with automatic SDK integrations disabled", async () => {
    const mod = await loadErrorReporting();

    mod.initializeErrorReporting({
      dsn: "https://public@example.invalid/1",
      getStorageManager: () => ({ loadAppState: loadAppStateMock }),
      getRelease: () => "1.2.0",
      sentryMainModule: {
        init: initMock,
        withScope: withScopeMock,
        captureException: captureExceptionMock,
      },
    });

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "production",
        release: "1.2.0",
        defaultIntegrations: false,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        maxBreadcrumbs: 0,
      }),
    );
  });

  it("derives the GlitchTip environment from the prerelease identifier", async () => {
    const mod = await loadErrorReporting();

    mod.initializeErrorReporting({
      dsn: "https://public@example.invalid/1",
      getStorageManager: () => ({ loadAppState: loadAppStateMock }),
      getRelease: () => "1.2.0-beta.3",
      sentryMainModule: {
        init: initMock,
        withScope: withScopeMock,
        captureException: captureExceptionMock,
      },
    });

    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ environment: "beta" }));
  });

  it("captures main errors only when consent is enabled", async () => {
    const mod = await loadErrorReporting();
    mod.initializeErrorReporting({
      dsn: "https://public@example.invalid/1",
      getStorageManager: () => ({ loadAppState: loadAppStateMock }),
      getRelease: () => "1.2.0",
      sentryMainModule: {
        init: initMock,
        withScope: withScopeMock,
        captureException: captureExceptionMock,
      },
    });

    await mod.captureMainError(new Error("failed to open /Users/test/Novel/第三章.mdi"), {
      source: "uncaughtException",
    });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const captured = captureExceptionMock.mock.calls[0]?.[0] as Error;
    expect(captured.message).toContain("[file].mdi");

    captureExceptionMock.mockClear();
    loadAppStateMock.mockResolvedValueOnce({ errorReportingConsent: false });

    await mod.captureMainError(new Error("boom"), { source: "uncaughtException" });

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("sanitizes renderer payloads before capture", async () => {
    const mod = await loadErrorReporting();
    mod.initializeErrorReporting({
      dsn: "https://public@example.invalid/1",
      getStorageManager: () => ({ loadAppState: loadAppStateMock }),
      getRelease: () => "1.2.0",
      sentryMainModule: {
        init: initMock,
        withScope: withScopeMock,
        captureException: captureExceptionMock,
      },
    });

    await mod.captureRendererError({
      source: "error-boundary",
      sectionName: "エディタ",
      message: "failed to render /Users/test/Novel/第三章.mdi",
      stack: [
        "at render (C:\\Users\\test\\Novel\\第四章.mdi:10:1)",
        "at apply (/Users/test/Repos/illusions/components/editor/MilkdownEditor.tsx:224001:1)",
      ].join("\n"),
    });

    const captured = captureExceptionMock.mock.calls[0]?.[0] as Error;
    expect(captured.message).toContain("[file].mdi");
    expect(captured.message).not.toContain("第三章.mdi");
    expect(captured.stack).toContain("[path]");
    expect(captured.stack).toContain("components/editor/MilkdownEditor.tsx:224001:1");
  });
});
