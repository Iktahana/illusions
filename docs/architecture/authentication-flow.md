---
title: 認証・OAuth PKCE フロー
slug: authentication-flow
type: architecture
status: active
updated: 2026-06-11
tags:
  - architecture
  - auth
  - oauth
  - pkce
  - security
---

# 認証・OAuth PKCE フロー

illusions では、ユーザーのセキュリティを確保し、クライアント側にシークレットを保持せずに安全に認証を行うため、**OAuth 2.0 PKCE (Proof Key for Code Exchange)** フローを採用しています。

## 設計の目的

- **シークレットレス認証**: クライアントアプリ（Web/Electron）に `client_secret` を埋め込むことなく安全にトークンを取得する。
- **マルチプラットフォーム対応**: Web ブラウザとデスクトップアプリの両方で一貫した認証体験を提供する。
- **セキュアな通信**: 認可コードの横取り攻撃（Insecure Redirect）を PKCE によって防ぐ。

## PKCE の仕組み

PKCE は以下の 3 つのステップで構成されます。

1. **Code Verifier の生成**: ランダムな文字列（verifier）を生成し、クライアント側に一時保存します。
2. **Code Challenge の生成**: verifier を SHA-256 でハッシュ化し、認可リクエスト時にサーバーへ送ります。
3. **検証**: 認可コードをトークンと交換する際、保存していた verifier をサーバーに送ります。サーバーはハッシュ化して最初に受け取った challenge と一致するかを確認します。

## 実行フロー

### Web 版のフロー

1. **ログイン開始**: `startWebLogin()` が呼ばれ、`code_verifier` と `state` を生成し、`sessionStorage` に保存します。
2. **認可リクエスト**: ブラウザを認可サーバー（`my.illusions.app`）の `/api/oauth/authorize` にリダイレクトします。
3. **コールバック**: ユーザーが承認すると、`/auth/callback/` にリダイレクトされ、認可コードを取得します。
4. **トークン交換**: 保存していた `code_verifier` を使い、認可コードをトークンと交換します。

### Electron 版のフロー

1. **ログイン開始**: レンダラーから IPC (`auth:login`) を通じてメインプロセスへ要求を送ります。
2. **ブラウザ起動**: メインプロセスが PKCE パラメータを生成します。通常版は `shell.openExternal` でシステム標準ブラウザを開き、Mac App Store 版は Node API を持たない制限付き `BrowserWindow` 内で認可画面を開きます。
3. **認可と返却**: ブラウザで認可が完了すると、カスタムプロトコル（`illusions://auth/callback`）を通じて認可コードが Electron アプリに返されます。
4. **トークン取得**: メインプロセスがトークン交換を行い、結果をレンダラーに通知します。

## セキュリティ上の考慮事項

- **State パラメータ**: CSRF（クロスサイトリクエストフォージェリ）防止のため、ランダムな `state` 値を検証に使用します。
- **MAS 認可ウィンドウ**: ポップアップを拒否し、`my.illusions.app`、GitHub／Google／Apple の既知の認可 origin、および検証済みの `illusions://auth/callback` 以外へのトップレベル遷移を拒否します。キャンセル・ロード失敗・親ウィンドウ終了時には保留中の state を破棄します。
- **MAS アカウント削除**: アカウント削除ページは、外部ブラウザではなく同じく制限付きの app-owned window で開きます。
- **セキュアな保存**: 取得した `access_token` および `refresh_token` は、環境に応じたセキュアなストレージ（ブラウザの HttpOnly Cookie、Electron の安全な暗号化ストア等）に保持されます。
- **有効期限**: トークンには有効期限を設定し、必要に応じてリフレッシュトークンによる更新を行います。

## Electron におけるトークンリフレッシュの動作

Electron 版では、`AuthProvider` がトークンの有効期限前にバックグラウンドで自動リフレッシュを行います。エラー発生時の動作は、エラーの種類によって分岐します。

### 永続的エラー（4xx / `invalid_grant`）

`isElectronAuthErrorPermanent()` 関数が以下の条件をチェックし、永続的エラーと判定します。

- OAuth エラーコードが `invalid_grant`、`invalid_client`、`unauthorized_client`、`unsupported_grant_type` のいずれか（RFC 6749 §5.2 準拠）
- IPC から返された HTTP ステータスが 400〜499 の範囲

永続的エラーと判定された場合、トークンは無効（失効済み）とみなし、直ちにログアウトしてストレージからトークンを削除します。リトライは行いません。

### 一時的エラー（5xx / ネットワーク障害）

一時的エラーの場合はセッションを維持し、次のリフレッシュをスケジュールします。リフレッシュ間隔には最低 60 秒のフロア値（`TRANSIENT_RETRY_MIN_MS`）が設定されています。これにより、失効済みトークンで即座に再スケジュールされるタイトループを防ぎます。

## 関連ファイル

`AuthContext` は #1437 でアダプタ層とセッション制御に分離されました。現状の実装は `lib/auth/` を参照してください。

- `lib/auth/web-auth.ts`: Web 用の PKCE ユーティリティ
- `lib/auth/web-session.ts`: Web セッション制御アダプタ
- `lib/auth/electron-session.ts`: Electron セッション制御アダプタ（`token-storage.ts` 経由で safeStorage を使用）
- `lib/auth/token-storage.ts`: Electron 向けトークン永続化（safeStorage 非対応環境では平文保存を廃止）
- `lib/auth/refresh-scheduler.ts`: バックグラウンドトークンリフレッシュスケジューラ
- `lib/auth/session-epoch.ts`: ログアウトのハード境界管理（旧セッションの非同期コールバックを無効化）
- `lib/auth/use-auth-session.ts`: React フック（アダプタ + スケジューラを組み合わせた UI 層）
- `app/auth/callback/page.tsx`: Web 用のコールバックハンドラ
- `electron/ipc/auth-ipc.js`: Electron 用の認証 IPC
- `contexts/AuthContext.tsx`: アプリケーション全体の認証状態管理（薄いラッパ）
