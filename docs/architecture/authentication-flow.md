---
title: 認証・OAuth PKCE フロー
slug: authentication-flow
type: architecture
status: active
updated: 2026-04-06
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
2. **ブラウザ起動**: メインプロセスが PKCE パラメータを生成し、`shell.openExternal` でシステム標準のブラウザを開きます。
3. **認可と返却**: ブラウザで認可が完了すると、カスタムプロトコル（`illusions://auth-callback`）を通じて認可コードが Electron アプリに返されます。
4. **トークン取得**: メインプロセスがトークン交換を行い、結果をレンダラーに通知します。

## セキュリティ上の考慮事項

- **State パラメータ**: CSRF（クロスサイトリクエストフォージェリ）防止のため、ランダムな `state` 値を検証に使用します。
- **セキュアな保存**: 取得した `access_token` および `refresh_token` は、環境に応じたセキュアなストレージ（ブラウザの HttpOnly Cookie、Electron の安全な暗号化ストア等）に保持されます。
- **有効期限**: トークンには有効期限を設定し、必要に応じてリフレッシュトークンによる更新を行います。

## 関連ファイル

- `lib/auth/web-auth.ts`: Web 用の PKCE ユーティリティ
- `app/auth/callback/page.tsx`: Web 用のコールバックハンドラ
- `electron/ipc/auth-ipc.js`: Electron 用の認証 IPC
- `contexts/AuthContext.tsx`: アプリケーション全体の認証状態管理
