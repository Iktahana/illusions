import { beforeEach, describe, expect, it, vi } from "vitest";

type CaptureRendererErrorHandler = (_event: unknown, payload: unknown) => Promise<void>;

async function loadErrorReportingIpc(): Promise<typeof import("../error-reporting-ipc.js")> {
  vi.resetModules();
  return import("../error-reporting-ipc.js");
}

async function createHandler(captureRendererError = vi.fn().mockResolvedValue(undefined)): Promise<{
  handler: CaptureRendererErrorHandler;
  captureRendererError: ReturnType<typeof vi.fn>;
}> {
  const mod = await loadErrorReportingIpc();
  return {
    handler: mod.createCaptureRendererErrorHandler({ captureRendererError }),
    captureRendererError,
  };
}

describe("createCaptureRendererErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards valid renderer error payloads", async () => {
    const { handler, captureRendererError } = await createHandler();

    await handler({}, { source: "window-error", message: "boom" });

    expect(captureRendererError).toHaveBeenCalledWith({ source: "window-error", message: "boom" });
  });

  it("ignores non-object payloads", async () => {
    const { handler, captureRendererError } = await createHandler();

    await handler({}, "boom");

    expect(captureRendererError).not.toHaveBeenCalled();
  });

  it("ignores payloads with invalid source", async () => {
    const { handler, captureRendererError } = await createHandler();

    await handler({}, { source: "bad-source", message: "boom" });

    expect(captureRendererError).not.toHaveBeenCalled();
  });

  it("swallows capture errors", async () => {
    const captureRendererError = vi.fn().mockRejectedValue(new Error("send failed"));
    const { handler } = await createHandler(captureRendererError);

    await expect(
      handler({}, { source: "error-boundary", message: "boom" }),
    ).resolves.toBeUndefined();
  });
});
