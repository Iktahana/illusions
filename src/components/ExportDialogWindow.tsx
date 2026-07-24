"use client";

import { useEffect, useState } from "react";
import ExportDialog, { type ExportDialogFormat } from "./ExportDialog";
import TxtExportDialog from "./TxtExportDialog";
import type { ExportMetadata } from "@/lib/export/types";
import type { TxtExportFormat, TxtIndentOptions } from "@/lib/export/txt-export-types";

type Request =
  | { kind: "txt"; format: TxtExportFormat; operation: "export" | "copy" }
  | {
      kind: "document";
      format: ExportDialogFormat;
      content: string;
      metadata: ExportMetadata;
      fileType: ".mdi" | ".md" | ".txt";
    };

export default function ExportDialogWindow(): React.JSX.Element | null {
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const getRequest = window.electronAPI?.getExportDialogRequest;
    if (!getRequest) {
      setError("エクスポート設定ウィンドウを初期化できません。アプリを再起動してください。");
      return;
    }
    void getRequest()
      .then((value) => {
        if (value) setRequest(value as Request);
        else setError("エクスポート要求が見つかりません。もう一度お試しください。");
      })
      .catch(() => setError("エクスポート設定の読み込みに失敗しました。"));
  }, []);
  const complete = (result: Record<string, unknown> | null) =>
    void window.electronAPI?.completeExportDialog?.(result);
  const confirmDiscard = async (): Promise<boolean> =>
    (await window.electronAPI?.confirmExportDialogDiscard?.()) ?? false;
  if (error) {
    return <main className="min-h-screen bg-background p-8 text-sm text-danger">{error}</main>;
  }
  if (!request) {
    return (
      <main className="min-h-screen bg-background p-8 text-sm text-foreground-secondary">
        エクスポート設定を読み込んでいます…
      </main>
    );
  }
  if (request.kind === "txt")
    return (
      <TxtExportDialog
        isOpen
        presentation="window"
        confirmDiscard={confirmDiscard}
        format={request.format}
        operation={request.operation}
        onCancel={() => complete(null)}
        onConfirm={(options: TxtIndentOptions) => complete({ kind: "txt", options })}
      />
    );
  return (
    <ExportDialog
      isOpen
      presentation="window"
      confirmDiscard={confirmDiscard}
      initialFormat={request.format}
      content={request.content}
      metadata={request.metadata}
      fileType={request.fileType}
      onClose={() => complete(null)}
      onExportHtml={(options) => complete({ kind: "document", format: "html", options })}
      onExportPdf={(options) => complete({ kind: "document", format: "pdf", options })}
      onExportDocx={(options) => complete({ kind: "document", format: "docx", options })}
      onExportEpub={(options) => complete({ kind: "document", format: "epub", options })}
    />
  );
}
