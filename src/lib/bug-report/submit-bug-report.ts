import { detectOSPlatform } from "@/lib/utils/runtime-env";
import { deriveReleaseEnvironment } from "@/lib/error-reporting/release-environment";
import type { BugReportCategory, BugReportDiagnostics, BugReportInput } from "./bug-report-types";

/**
 * リクエストのタイムアウト (ms)。
 */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * カテゴリ → GlitchTip 上での重要度。トリアージしやすいよう分ける。
 */
const CATEGORY_LEVEL: Record<BugReportCategory, string> = {
  bug: "error",
  "ai-inappropriate": "warning",
  feature: "info",
  other: "info",
};

/**
 * アプリバージョン + OS のみの最小限の診断情報を収集する。
 * 原稿の内容やファイルパスなど、機微な情報は一切含めない。
 */
export function collectDiagnostics(): BugReportDiagnostics {
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const os = detectOSPlatform() ?? "unknown";
  return { appVersion, os };
}

interface ParsedDsn {
  ingestUrl: string;
  publicKey: string;
}

/**
 * GlitchTip/Sentry の DSN を ingest エンドポイント + public key に分解する。
 * 専用のバグ報告バックエンドは存在しないため、クラッシュ報告と同じ
 * GlitchTip プロジェクトへ通常の error イベントとして送信する。
 */
function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return {
      ingestUrl: `${url.protocol}//${url.host}/api/${projectId}/store/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

export interface SubmitBugReportResult {
  ok: boolean;
  status?: number;
}

/**
 * ユーザーからのバグ・要望報告を GlitchTip へ通常の error イベントとして送信する。
 * DSN の public key は秘匿情報ではないため、レンダラー (web / Electron 両対応) から
 * 直接 fetch してよい。CSRF 保護のかかった Web UI ではなく ingest API を叩く。
 */
export async function submitBugReport(input: BugReportInput): Promise<SubmitBugReportResult> {
  const dsn = process.env.NEXT_PUBLIC_ERROR_REPORT_DSN || "";
  const parsed = parseDsn(dsn);
  if (!parsed) return { ok: false };

  const diagnostics = collectDiagnostics();
  const title = input.title.trim();
  const description = input.description.trim();
  const reproductionSteps = input.reproductionSteps?.trim();
  const email = input.email?.trim();

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    logger: "bug-report-form",
    level: CATEGORY_LEVEL[input.category],
    message: title,
    release: diagnostics.appVersion,
    environment: deriveReleaseEnvironment(diagnostics.appVersion),
    tags: {
      source: "bug-report-form",
      category: input.category,
      os: diagnostics.os,
    },
    extra: {
      description,
      ...(reproductionSteps ? { reproductionSteps } : {}),
    },
    ...(email ? { user: { email } } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(parsed.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=illusions-bug-report/1.0, sentry_key=${parsed.publicKey}`,
      },
      credentials: "omit",
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}
