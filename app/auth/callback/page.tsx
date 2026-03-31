"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { consumePendingAuth } from "@/lib/auth/web-auth";

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");

    if (oauthError) {
      queueMicrotask(() => setError(`認証エラー: ${oauthError}`));
      return;
    }

    if (!code || !state) {
      queueMicrotask(() => setError("認証パラメータが不足しています。"));
      return;
    }

    const pending = consumePendingAuth();
    if (!pending || pending.state !== state) {
      queueMicrotask(() => setError("認証セッションが無効です。もう一度ログインしてください。"));
      return;
    }

    async function exchange() {
      try {
        const res = await fetch("/api/auth/exchange/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            codeVerifier: pending!.codeVerifier,
            redirectUri: `${window.location.origin}/auth/callback/`,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? "トークン交換に失敗しました。");
          return;
        }

        window.location.href = "/";
      } catch {
        setError("ログイン処理中にエラーが発生しました。");
      }
    }

    void exchange();
  }, [searchParams]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="max-w-sm space-y-4 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            トップに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-foreground-secondary">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground-tertiary border-t-accent" />
        <span className="text-sm">ログイン中...</span>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex items-center gap-3 text-foreground-secondary">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground-tertiary border-t-accent" />
            <span className="text-sm">ログイン中...</span>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
