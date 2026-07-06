import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { collectDiagnostics, submitBugReport } from "../submit-bug-report";

// detectOSPlatform を制御するためモック
vi.mock("@/lib/utils/runtime-env", () => ({
  detectOSPlatform: () => "mac",
}));

const originalFetch = globalThis.fetch;
const TEST_DSN = "https://testkey123@bug-report.api.illusions.app/1";

describe("collectDiagnostics", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
  });

  it("アプリバージョンと OS のみを返す", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.4.2";
    const diag = collectDiagnostics();
    expect(diag).toEqual({ appVersion: "1.4.2", os: "mac" });
  });

  it("バージョン未設定時は 0.0.0 にフォールバックする", () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    expect(collectDiagnostics().appVersion).toBe("0.0.0");
  });
});

describe("submitBugReport", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.4.2";
    process.env.NEXT_PUBLIC_ERROR_REPORT_DSN = TEST_DSN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    delete process.env.NEXT_PUBLIC_ERROR_REPORT_DSN;
  });

  it("DSN の ingest エンドポイントへ X-Sentry-Auth 付きで POST する", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock;

    const result = await submitBugReport({
      category: "bug",
      title: "  クラッシュ  ",
      description: "  詳細  ",
      reproductionSteps: "1. 起動",
      email: "user@example.com",
    });

    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://bug-report.api.illusions.app/api/1/store/");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("omit");
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(options.headers["X-Sentry-Auth"]).toContain("sentry_key=testkey123");

    const body = JSON.parse(options.body as string);
    expect(body.tags.category).toBe("bug");
    expect(body.level).toBe("error");
    // title / description は trim される
    expect(body.message).toBe("クラッシュ");
    expect(body.extra.description).toBe("詳細");
    expect(body.extra.reproductionSteps).toBe("1. 起動");
    expect(body.user).toEqual({ email: "user@example.com" });
    expect(body.tags.source).toBe("bug-report-form");
    expect(body.release).toBe("1.4.2");
    expect(body.tags.os).toBe("mac");
  });

  it("空の再現手順・メールは payload から省かれる", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock;

    await submitBugReport({
      category: "feature",
      title: "要望",
      description: "内容",
      reproductionSteps: "   ",
      email: "",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty("user");
    expect(body.extra).not.toHaveProperty("reproductionSteps");
    expect(body.level).toBe("info");
  });

  it("原稿内容やファイルパスに相当するフィールドを送らない", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock;

    await submitBugReport({ category: "other", title: "t", description: "d" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // tags は source / category / os の 3 キーのみ
    expect(Object.keys(body.tags).sort()).toEqual(["category", "os", "source"]);
  });

  it("DSN 未設定時は ok:false を返し fetch しない", async () => {
    delete process.env.NEXT_PUBLIC_ERROR_REPORT_DSN;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const result = await submitBugReport({ category: "bug", title: "t", description: "d" });
    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ネットワークエラー時は ok:false を返す", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const result = await submitBugReport({ category: "bug", title: "t", description: "d" });
    expect(result).toEqual({ ok: false });
  });

  it("HTTP エラー応答時は ok:false + status を返す", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await submitBugReport({ category: "bug", title: "t", description: "d" });
    expect(result).toEqual({ ok: false, status: 500 });
  });
});
