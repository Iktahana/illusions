"use client";

import { useEffect, useState } from "react";
import GlassDialog from "@/shared/ui/GlassDialog";
import { notificationManager } from "@/lib/services/notification-manager";
import {
  BUG_REPORT_CATEGORY_LABELS,
  BUG_REPORT_CATEGORY_ORDER,
  type BugReportCategory,
} from "@/lib/bug-report/bug-report-types";
import { collectDiagnostics, submitBugReport } from "@/lib/bug-report/submit-bug-report";

interface BugReportDialogProps {
  isOpen: boolean;
  initialCategory: BugReportCategory;
  onClose: () => void;
}

const OS_LABELS: Record<string, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
  unknown: "不明",
};

export default function BugReportDialog({
  isOpen,
  initialCategory,
  onClose,
}: BugReportDialogProps) {
  const [category, setCategory] = useState<BugReportCategory>(initialCategory);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reproSteps, setReproSteps] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 両入口 (バグ報告 / AI報告) で同一インスタンスを再利用するため、
  // 開くたびにカテゴリを initialCategory へ再同期し、入力もリセットする。
  useEffect(() => {
    if (isOpen) {
      setCategory(initialCategory);
      setTitle("");
      setDescription("");
      setReproSteps("");
      setEmail("");
      setIsSubmitting(false);
    }
  }, [isOpen, initialCategory]);

  const diagnostics = collectDiagnostics();
  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !isSubmitting;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const result = await submitBugReport({
      category,
      title,
      description,
      reproductionSteps: reproSteps,
      email,
    });
    setIsSubmitting(false);

    if (result.ok) {
      notificationManager.showMessage("報告を送信しました。ご協力ありがとうございます。", {
        type: "success",
      });
      onClose();
    } else {
      notificationManager.showMessage("送信に失敗しました。時間をおいて再度お試しください。", {
        type: "error",
      });
    }
  }

  return (
    <GlassDialog
      isOpen={isOpen}
      onBackdropClick={isSubmitting ? undefined : onClose}
      ariaLabel="バグ・ご要望を報告"
      panelClassName="mx-4 w-full max-w-lg p-6"
    >
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">バグ・ご要望を報告</h3>

        <div className="space-y-3">
          {/* カテゴリ */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">種別</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BugReportCategory)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {BUG_REPORT_CATEGORY_ORDER.map((key) => (
                <option key={key} value={key}>
                  {BUG_REPORT_CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {/* タイトル (必須) */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">
              タイトル *
            </label>
            <input
              type="text"
              placeholder="例: 起動時にクラッシュする"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>

          {/* 詳細 (必須) */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">
              詳細 *
            </label>
            <textarea
              placeholder="発生した問題やご要望の内容を具体的にご記入ください"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={4}
            />
          </div>

          {/* 再現手順 (任意) */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">
              再現手順
            </label>
            <textarea
              placeholder="1. ○○を開く&#10;2. ○○をクリック&#10;3. ……"
              value={reproSteps}
              onChange={(e) => setReproSteps(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              rows={3}
            />
          </div>

          {/* メール (任意) */}
          <div>
            <label className="text-xs font-medium text-foreground-secondary mb-1 block">
              メールアドレス
            </label>
            <input
              type="email"
              placeholder="例: you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-foreground-secondary mt-1">
              任意です。ご記入いただくと、フォローアップをこのメールアドレスでご連絡する場合があります。
            </p>
          </div>

          {/* 診断情報の明示 */}
          <p className="text-xs text-foreground-secondary border-t border-border pt-3">
            診断情報を添付します: アプリバージョン {diagnostics.appVersion} / OS{" "}
            {OS_LABELS[diagnostics.os] ?? diagnostics.os}
            （原稿の内容やファイルパスは送信されません）
          </p>
        </div>

        {/* アクション */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground transition-colors rounded hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "送信中…" : "送信"}
          </button>
        </div>
      </div>
    </GlassDialog>
  );
}
