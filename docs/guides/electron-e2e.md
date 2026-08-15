---
title: Electron E2E と packaged smoke
slug: electron-e2e
type: guide
status: active
updated: 2026-08-15
tags:
  - testing
  - electron
  - playwright
---

# Electron E2E と packaged smoke

Electron UI の回帰は Playwright の Electron API で検証する。unit / component test を置き換えるものではなく、renderer、preload、IPC、main process をまたぐ重要な経路を確認する層である。

## ローカル実行

```bash
npm run test:e2e:smoke
npm run test:e2e
```

`playwright.electron.config.ts` が suite を Vitest から分離する。smoke は launch、編集、Save As、再オープン、writing mode を検証する安定した subset である。

テストは `test-results/e2e-workers/` 配下に worker ごとの user data、project、download、export directory を作る。成果物は git と Prettier の対象外であり、失敗時の trace、screenshot、video、main-process log を保持する。

E2E mode は `ILLUSIONS_E2E=1` で起動する。この mode では analytics、error reporting、auto-update を止めるが、Electron sandbox、context isolation、IPC allowlist、filesystem policy は通常どおり維持する。テスト window は off-screen であり、fixture は success、failure、timeout の全経路で Electron root process の終了を待ち、必要なら強制終了する。ローカルの他の Electron application や production profile は操作しない。

## Native boundary

native dialog は OS UI をクリックしない。fixture が main process の `dialog.showOpenDialog` と `dialog.showSaveDialog` を deterministic に差し替え、各 test が queue した一意の path だけを返す。path は実際の production IPC と filesystem policy を通る。

editor context menu も main process の `Menu.buildFromTemplate()` を観測する。test は renderer → preload → IPC → native template の経路を実行し、allowlisted command ID、Japanese label、native editing role、enabled state を検証する。production bundle に test-only IPC は追加しない。

## CI

`.github/workflows/electron-e2e.yml` は `alpha`、`beta`、`main` の push と promotion PR、手動 dispatch で Windows と macOS を並列実行する。`dev` では detailed E2E を実行しない。platform ごとの Playwright worker 数は 1、CI retry は 1 回である。

`.github/workflows/build.yml` の packaged smoke は build job が同じ SHA で生成した artifact を download して検証する。smoke job 自身は rebuild しない。

- Windows x64: signed NSIS installer を temporary location へ silent install して起動する。
- macOS x64 / arm64: signed ZIP を展開し、署名確認後に `.app` を起動する。

packaged smoke の failure、timeout、unexpected skip は release を阻止する。失敗時は診断 artifact を 14 日保持する。

## 追加時のルール

- fixed sleep を readiness 判定に使わない。role、accessible name、`data-testid`、assertion auto-wait を使う。
- test ごとに profile と filesystem path を共有しない。
- native dialog / context menu の mock は fixture 内に閉じ、renderer から任意 action を main process へ送れるようにしない。
- 新しい機能 scenario は対象 issue に追加し、#2295 を単なる UI feature の close 条件にしない。
- E2E failure は skip で隠さない。flake は owner と期限を持つ別 issue で追跡する。
