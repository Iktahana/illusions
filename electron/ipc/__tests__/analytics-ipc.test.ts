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
    process.env.APTABASE_APP_KEY = "test-app-key";
    loadAppStateMock.mockResolvedValue({});
    trackEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.APTABASE_APP_KEY;
  });

  it("tracks contract-approved events when analytics consent is enabled", async () => {
    const handler = await createHandler();

    await handler({}, "save_completed", {
      trigger: "manual",
      mode: "standalone",
      target_kind: "file",
    });

    expect(loadAppStateMock).toHaveBeenCalledOnce();
    expect(trackEventMock).toHaveBeenCalledWith("save_completed", {
      trigger: "manual",
      mode: "standalone",
      target_kind: "file",
    });
  });

  it("tracks app_heartbeat without props", async () => {
    const handler = await createHandler();

    await handler({}, "app_heartbeat");

    expect(loadAppStateMock).toHaveBeenCalledOnce();
    expect(trackEventMock).toHaveBeenCalledWith("app_heartbeat", undefined);
  });

  it("tracks app_closed with a valid duration bucket", async () => {
    const handler = await createHandler();

    await handler({}, "app_closed", { duration_bucket: "15_60m" });

    expect(loadAppStateMock).toHaveBeenCalledOnce();
    expect(trackEventMock).toHaveBeenCalledWith("app_closed", { duration_bucket: "15_60m" });
  });

  it.each([
    ["document_output_completed", "export", "html"],
    ["document_output_completed", "export", "pdf"],
    ["document_output_completed", "export", "epub"],
    ["document_output_completed", "export", "docx"],
    ["document_output_completed", "export", "txt"],
    ["document_output_completed", "export", "txt-ruby"],
    ["document_output_completed", "export", "narou"],
    ["document_output_completed", "export", "kakuyomu"],
    ["document_output_completed", "export", "aozora"],
    ["document_output_completed", "copy", "txt"],
    ["document_output_completed", "copy", "txt-ruby"],
    ["document_output_completed", "copy", "narou"],
    ["document_output_completed", "copy", "kakuyomu"],
    ["document_output_completed", "copy", "aozora"],
    ["note_output_completed", "export", "note"],
    ["note_output_completed", "copy", "note"],
  ] as const)("tracks approved %s %s output usage for %s", async (eventName, operation, format) => {
    const handler = await createHandler();

    await handler({}, eventName, { operation, format });

    expect(loadAppStateMock).toHaveBeenCalledOnce();
    expect(trackEventMock).toHaveBeenCalledWith(eventName, {
      operation,
      format,
    });
  });

  it("rejects document output data outside the fixed enums", async () => {
    const handler = await createHandler();

    await handler({}, "document_output_completed", {
      operation: "export",
      format: "/Users/alice/private/novel.epub",
    });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects a document output event carrying a file path", async () => {
    const handler = await createHandler();

    await handler({}, "document_output_completed", {
      operation: "export",
      format: "epub",
      path: "/Users/alice/private/novel.epub",
    });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects Note output properties that could carry private data", async () => {
    const handler = await createHandler();

    await handler({}, "note_output_completed", {
      operation: "copy",
      format: "note",
      path: "/Users/alice/private/作品_note.txt",
      title: "非公開ノート",
      content: "本文",
      clipboardText: "コピー内容",
      error: "private error",
    });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects app_closed with a non-contract duration bucket before reading consent", async () => {
    const handler = await createHandler();

    await handler({}, "app_closed", { duration_bucket: "42m" });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("does not track events when analytics consent is disabled", async () => {
    loadAppStateMock.mockResolvedValue({ usageAnalyticsConsent: false });
    const handler = await createHandler();

    await handler({}, "auth_login_started", { surface: "settings" });

    expect(loadAppStateMock).toHaveBeenCalledOnce();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("does not load app state or track when the app key is unavailable", async () => {
    const handler = await createHandler(false);

    await handler({}, "auth_login_started", { surface: "settings" });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects non-whitelisted props before reading consent", async () => {
    const handler = await createHandler();

    await handler({}, "file_open_completed", {
      surface: "menu",
      source: "dialog",
      file_type: "mdi",
      nested: { path: "/tmp/file.mdi" },
    });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("validates app lifecycle analytics props against the contract", async () => {
    const { isWhitelistedProps } = await loadAnalyticsIpc();

    expect(isWhitelistedProps("app_heartbeat", undefined)).toBe(true);
    expect(isWhitelistedProps("app_closed", { duration_bucket: "15_60m" })).toBe(true);
    expect(isWhitelistedProps("app_closed", { duration_bucket: "42m" })).toBe(false);
  });

  it("rejects unknown event names before reading consent", async () => {
    const handler = await createHandler();

    await handler({}, "feature_used", { feature: "export" });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects non-contract props that could carry account data before reading consent", async () => {
    const handler = await createHandler();

    await handler({}, "auth_login_completed", { surface: "settings", email: "user@example.com" });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects non-contract prop values before reading consent", async () => {
    const handler = await createHandler();

    await handler({}, "project_file_created", {
      surface: "explorer",
      file_type: "chapter-name.mdi",
      collision: "none",
    });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects empty event names before reading consent", async () => {
    const handler = await createHandler();

    await handler({}, "", { feature: "export" });

    expect(loadAppStateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("rejects missing required properties and non-finite values", async () => {
    const { isWhitelistedProps } = await loadAnalyticsIpc();

    expect(isWhitelistedProps("search_completed", undefined)).toBe(false);
    expect(isWhitelistedProps("search_completed", { scope: "current" })).toBe(false);
    expect(isWhitelistedProps("app_heartbeat", { count: Number.NaN })).toBe(false);
  });

  it("accepts every declared event with its finite anonymous contract", async () => {
    const { isWhitelistedProps } = await loadAnalyticsIpc();
    const contract = await import("../../../src/lib/analytics/usage-event-contract.json");

    for (const [eventName, fields] of Object.entries(contract.default.events)) {
      const props = Object.fromEntries(
        Object.entries(fields).map(([key, values]) => [key, (values as string[])[0]]),
      );
      expect(
        isWhitelistedProps(eventName, Object.keys(props).length > 0 ? props : undefined),
        eventName,
      ).toBe(true);
    }
  });

  it("rejects high-risk content fields on new workflow events", async () => {
    const { isWhitelistedProps } = await loadAnalyticsIpc();
    const privateFields = {
      path: "/Users/alice/novel.mdi",
      query: "secret search",
      url: "https://private.example",
      model_id: "private-model",
      error: "raw error",
      content: "manuscript",
    };

    expect(
      isWhitelistedProps("search_completed", {
        scope: "current",
        case_sensitive: "false",
        whole_word: "false",
        regex: "false",
        target: "all",
        result_count_bucket: "1",
        ...privateFields,
      }),
    ).toBe(false);
  });
});
