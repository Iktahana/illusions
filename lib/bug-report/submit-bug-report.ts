import { detectOSPlatform } from "@/lib/utils/runtime-env";
import type { BugReportDiagnostics, BugReportInput, BugReportPayload } from "./bug-report-types";

/**
 * バグ報告バックエンドのエンドポイント。
 */
export const BUG_REPORT_ENDPOINT = "https://bug-report.api.illusions.app";

/**
 * リクエストのタイムアウト (ms)。
 */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * アプリバージョン + OS のみの最小限の診断情報を収集する。
 * 原稿の内容やファイルパスなど、機微な情報は一切含めない。
 */
export function collectDiagnostics(): BugReportDiagnostics {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const os = detectOSPlatform() ?? "unknown";
  return { appVersion, os };
}

/**
 * 空文字・空白のみのフィールドを省いた payload を構築する。
 */
function buildPayload(input: BugReportInput, submittedAt: string): BugReportPayload {
  const payload: BugReportPayload = {
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    diagnostics: collectDiagnostics(),
    source: "illusions-app",
    submittedAt,
  };

  const reproductionSteps = input.reproductionSteps?.trim();
  if (reproductionSteps) {
    payload.reproductionSteps = reproductionSteps;
  }

  const email = input.email?.trim();
  if (email) {
    payload.email = email;
  }

  return payload;
}

export interface SubmitBugReportResult {
  ok: boolean;
  status?: number;
}

/**
 * バグ報告をバックエンドへ POST する。
 * レンダラー (web / Electron 両対応) から直接 fetch する。
 */
export async function submitBugReport(input: BugReportInput): Promise<SubmitBugReportResult> {
  const payload = buildPayload(input, new Date().toISOString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(BUG_REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}
