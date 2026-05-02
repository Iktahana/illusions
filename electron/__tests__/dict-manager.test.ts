import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockResponseConfig {
  type?: "response";
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

interface MockTimeoutConfig {
  type: "timeout";
}

type MockRequestStep = MockResponseConfig | MockTimeoutConfig;

const { appGetPathMock } = vi.hoisted(() => ({
  appGetPathMock: vi.fn(() => "/tmp/illusions-dict-test"),
}));

vi.mock("electron", () => ({
  app: {
    getPath: appGetPathMock,
  },
}));

class MockResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  private readonly body: string;

  constructor({ statusCode, headers = {}, body = "" }: MockResponseConfig) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
  }

  resume(): void {}

  setEncoding(): void {}

  start(): void {
    queueMicrotask(() => {
      if (this.body) {
        this.emit("data", this.body);
      }
      this.emit("end");
    });
  }
}

function mockHttpsSequence(steps: MockRequestStep[]): void {
  const https = require("https") as typeof import("https");

  vi.spyOn(https, "get").mockImplementation(((
    requestUrl: string | URL,
    _options: unknown,
    callback?: (response: MockResponse) => void,
  ) => {
    const requestUrlString = String(requestUrl);
    const next = steps.shift();
    if (!next) {
      throw new Error(`Unexpected request for ${requestUrlString}`);
    }

    const req = new EventEmitter() as EventEmitter & {
      setTimeout: (timeout: number, cb: () => void) => void;
      destroy: (err: Error) => void;
    };

    req.destroy = (err) => {
      req.emit("error", err);
    };

    if (next.type === "timeout") {
      req.setTimeout = (_timeout, timeoutCallback) => {
        queueMicrotask(timeoutCallback);
      };
      return req as never;
    }

    req.setTimeout = (_timeout, _cb) => {};

    queueMicrotask(() => {
      const response = new MockResponse(next);
      callback?.(response as never);
      response.start();
    });

    return req as never;
  }) as unknown as typeof https.get);
}

describe("DictManager.checkUpdate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    appGetPathMock.mockReturnValue("/tmp/illusions-dict-test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the moved illusions-lab Genji releases API", async () => {
    mockHttpsSequence([
      {
        statusCode: 200,
        body: JSON.stringify({ tag_name: "v1.2.3", assets: [] }),
      },
    ]);

    const { getDictManager } = await import("../dict-manager.js");
    const result = await getDictManager().checkUpdate();

    expect(result.latestVersion).toBe("v1.2.3");
    const https = require("https") as typeof import("https");
    const getMock = vi.mocked(https.get);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(String(getMock.mock.calls[0]?.[0])).toBe(
      "https://api.github.com/repos/illusions-lab/Genji/releases/latest",
    );
  });

  it("follows a GitHub API 301 redirect before reading the release payload", async () => {
    mockHttpsSequence([
      {
        statusCode: 301,
        headers: {
          location: "https://api.github.com/repos/illusions-lab/Genji/releases/latest?redirected=1",
        },
      },
      {
        statusCode: 200,
        body: JSON.stringify({
          tag_name: "v2.0.0",
          assets: [
            {
              name: "genji.db.gz",
              browser_download_url:
                "https://github.com/illusions-lab/Genji/releases/download/v2.0.0/genji.db.gz",
            },
          ],
        }),
      },
    ]);

    const { getDictManager } = await import("../dict-manager.js");
    const result = await getDictManager().checkUpdate();

    expect(result).toEqual({
      latestVersion: "v2.0.0",
      installedVersion: undefined,
      updateAvailable: true,
    });
    const https = require("https") as typeof import("https");
    const getMock = vi.mocked(https.get);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(String(getMock.mock.calls[1]?.[0])).toBe(
      "https://api.github.com/repos/illusions-lab/Genji/releases/latest?redirected=1",
    );
  });

  it("surfaces a Japanese timeout error when the GitHub API request takes too long", async () => {
    mockHttpsSequence([{ type: "timeout" }]);

    const { getDictManager } = await import("../dict-manager.js");

    await expect(getDictManager().checkUpdate()).rejects.toThrow(
      "GitHub API リクエストがタイムアウトしました",
    );
  });
});
