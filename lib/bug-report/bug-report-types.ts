import type { OSPlatform } from "@/lib/utils/runtime-env";

/**
 * バグ・フィードバック報告のカテゴリ。
 * メニューのアクション ID / フォームの select 値として使う。
 */
export type BugReportCategory = "bug" | "feature" | "ai-inappropriate" | "other";

/**
 * カテゴリ → フォームに表示する日本語ラベル。
 */
export const BUG_REPORT_CATEGORY_LABELS: Record<BugReportCategory, string> = {
  bug: "BUG・不具合のフィードバック",
  feature: "ご要望・機能のリクエスト",
  "ai-inappropriate": "AI回答の不適切を報告",
  other: "その他・お問い合わせ",
};

/**
 * select の並び順（表示順を固定するため配列でも保持）。
 */
export const BUG_REPORT_CATEGORY_ORDER: BugReportCategory[] = [
  "bug",
  "feature",
  "ai-inappropriate",
  "other",
];

/**
 * 自動添付する診断情報。原稿の内容やファイルパスは一切含めない。
 */
export interface BugReportDiagnostics {
  appVersion: string;
  os: OSPlatform | "unknown";
}

/**
 * バックエンド (bug-report.api.illusions.app) へ POST する本体。
 * フィールド名はバックエンド実装と突合済みであること。
 */
export interface BugReportPayload {
  category: BugReportCategory;
  title: string;
  description: string;
  reproductionSteps?: string;
  email?: string;
  diagnostics: BugReportDiagnostics;
  source: "illusions-app";
  submittedAt: string;
}

/**
 * フォームからの送信入力（診断情報・メタは submit 側で付与）。
 */
export interface BugReportInput {
  category: BugReportCategory;
  title: string;
  description: string;
  reproductionSteps?: string;
  email?: string;
}
