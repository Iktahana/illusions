"use client";

import { useEffect, useRef, useState } from "react";
import RubyDialog from "./RubyDialog";
import type { RubyDialogRequest, RubyDialogResult } from "@/lib/editor-page/ruby-dialog-contract";

export default function RubyDialogWindow(): React.JSX.Element | null {
  const [request, setRequest] = useState<RubyDialogRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const getRequest = window.electronAPI?.getRubyDialogRequest;
    if (!getRequest) {
      setError("ルビ設定ウィンドウを初期化できません。アプリを再起動してください。");
      return;
    }
    void getRequest()
      .then((value) => {
        if (value) setRequest(value as RubyDialogRequest);
        else setError("ルビ設定の要求が見つかりません。もう一度お試しください。");
      })
      .catch(() => setError("ルビ設定の読み込みに失敗しました。"));
  }, []);

  const complete = (result: RubyDialogResult): void => {
    if (completedRef.current) return;
    completedRef.current = true;
    void window.electronAPI?.completeRubyDialog?.(result);
  };

  if (error) {
    return <main className="min-h-screen bg-background p-8 text-sm text-danger">{error}</main>;
  }
  if (!request) {
    return (
      <main className="min-h-screen bg-background p-8 text-sm text-foreground-secondary">
        ルビ設定を読み込んでいます…
      </main>
    );
  }

  return (
    <RubyDialog
      isOpen
      presentation="window"
      onClose={() => complete(null)}
      selectedText={request.selectedText}
      initialRuby={request.existingRuby}
      onApply={complete}
    />
  );
}
