import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockResponseConfig {
  type?: "response";
  statusCode: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
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
  private readonly body: string | Buffer;

  constructor({ statusCode, headers = {}, body = "" }: MockResponseConfig) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
  }

  resume(): void {}

  setEncoding(): void {}

  pipe<T extends { write: (chunk: string | Buffer) => unknown; end: () => unknown }>(dest: T): T {
    this.on("data", (chunk: string | Buffer) => dest.write(chunk));
    this.on("end", () => dest.end());
    return dest;
  }

  start(): void {
    queueMicrotask(() => {
      if (this.body.length > 0) {
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

const VALID_ASSET_URL =
  "https://github.com/illusions-lab/Genji/releases/download/v9.9.9/genji.db.gz";

function releaseJson(downloadUrl: string, digest?: string): string {
  return JSON.stringify({
    tag_name: "v9.9.9",
    assets: [{ name: "genji.db.gz", browser_download_url: downloadUrl, digest }],
  });
}

interface DownloadResult {
  success: boolean;
  version?: string;
  error?: string;
}

interface TestableDictManager {
  _getDictDir: () => string;
  download: (onProgress: (progress: number) => void) => Promise<DownloadResult>;
}

/**
 * Import a fresh DictManager and point its dict directory at a temp path.
 * The "electron" module is externalized in vitest, so app.getPath cannot be
 * mocked via vi.mock — override the private directory resolver instead.
 */
async function createManagerWithDictDir(dictDir: string): Promise<TestableDictManager> {
  const { getDictManager } = await import("../dict-manager.js");
  const manager = getDictManager() as unknown as TestableDictManager;
  manager._getDictDir = () => dictDir;
  return manager;
}

describe("DictManager.download security", () => {
  let tempDir: string;
  let dictDir: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "illusions-dict-test-"));
    dictDir = path.join(tempDir, "dict");
    appGetPathMock.mockReturnValue(tempDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects asset URLs whose scheme/host is not on the allowlist", async () => {
    mockHttpsSequence([
      {
        statusCode: 200,
        body: releaseJson("https://evil.example.com/genji.db.gz", `sha256:${"0".repeat(64)}`),
      },
    ]);

    const manager = await createManagerWithDictDir(dictDir);
    const result = await manager.download(() => {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("ダウンロードURLが取得できませんでした");
  });

  it("refuses to follow redirects to plaintext http URLs", async () => {
    mockHttpsSequence([
      {
        statusCode: 200,
        body: releaseJson(VALID_ASSET_URL, `sha256:${"0".repeat(64)}`),
      },
      {
        statusCode: 302,
        headers: { location: "http://evil.example.com/genji.db.gz" },
      },
    ]);

    const manager = await createManagerWithDictDir(dictDir);
    const result = await manager.download(() => {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("https 以外のダウンロード先は許可されていません");
  });

  it("rejects a download whose sha256 checksum does not match the release digest", async () => {
    const payload = gzipSync(Buffer.from("tampered-db"));
    mockHttpsSequence([
      {
        statusCode: 200,
        body: releaseJson(VALID_ASSET_URL, `sha256:${"0".repeat(64)}`),
      },
      { statusCode: 200, body: payload },
    ]);

    const manager = await createManagerWithDictDir(dictDir);
    const result = await manager.download(() => {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("辞書ファイルのチェックサム検証に失敗しました");
    expect(fs.existsSync(path.join(dictDir, "genji.db"))).toBe(false);
  });

  it("aborts when the release asset has no digest to verify against", async () => {
    const payload = gzipSync(Buffer.from("no-digest-db"));
    mockHttpsSequence([
      { statusCode: 200, body: releaseJson(VALID_ASSET_URL) },
      { statusCode: 200, body: payload },
    ]);

    const manager = await createManagerWithDictDir(dictDir);
    const result = await manager.download(() => {});

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "辞書ファイルのチェックサムが取得できなかったためダウンロードを中止しました",
    );
  });

  it("installs the database when the checksum matches the release digest", async () => {
    const dbContent = Buffer.from("sqlite-db-bytes");
    const payload = gzipSync(dbContent);
    const digest = `sha256:${createHash("sha256").update(payload).digest("hex")}`;
    mockHttpsSequence([
      { statusCode: 200, body: releaseJson(VALID_ASSET_URL, digest) },
      { statusCode: 200, body: payload },
    ]);

    const manager = await createManagerWithDictDir(dictDir);
    const result = await manager.download(() => {});

    expect(result).toEqual({ success: true, version: "v9.9.9" });
    expect(fs.readFileSync(path.join(dictDir, "genji.db"))).toEqual(dbContent);
    expect(fs.readFileSync(path.join(dictDir, "genji_version.txt"), "utf8")).toBe("v9.9.9");
  });
});
