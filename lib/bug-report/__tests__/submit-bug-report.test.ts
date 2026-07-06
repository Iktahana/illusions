import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { BUG_REPORT_ENDPOINT, collectDiagnostics, submitBugReport } from "../submit-bug-report";

// detectOSPlatform を制御するためモック
vi.mock("@/lib/utils/runtime-env", () => ({
  detectOSPlatform: () => "mac",
}));

const originalFetch = globalThis.fetch;

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
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_APP_VERSION;
  });

  it("エンドポイントへ JSON を POST し、診断情報と source を含める", async () => {
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
    expect(url).toBe(BUG_REPORT_ENDPOINT);
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("omit");
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });

    const body = JSON.parse(options.body as string);
    expect(body.category).toBe("bug");
    // title / description は trim される
    expect(body.title).toBe("クラッシュ");
    expect(body.description).toBe("詳細");
    expect(body.reproductionSteps).toBe("1. 起動");
    expect(body.email).toBe("user@example.com");
    expect(body.source).toBe("illusions-app");
    expect(body.diagnostics).toEqual({ appVersion: "1.4.2", os: "mac" });
    expect(typeof body.submittedAt).toBe("string");
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
    expect(body).not.toHaveProperty("reproductionSteps");
    expect(body).not.toHaveProperty("email");
  });

  it("原稿内容やファイルパスに相当するフィールドを送らない", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock;

    await submitBugReport({ category: "other", title: "t", description: "d" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // diagnostics は appVersion / os の 2 キーのみ
    expect(Object.keys(body.diagnostics).sort()).toEqual(["appVersion", "os"]);
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
