/**
 * Wiring & regression guards for the beta-aware auto-update flow (#1782 / #1785).
 *
 * `electron/auto-updater.js` は electron-updater を最上位で require するため vitest 環境では
 * そのままロードできない（実体が electron に触れてクラッシュする）。決定ロジックは純粋関数
 * `electron/lib/update-policy.js` に分離して update-policy.test.ts で検証済み。ここでは、
 * その純粋ロジックが正しく「メニューの手動チェック導線」へ結線されていることを、ソース不変条件
 * （drift guard、ipc-bridge.test.ts と同方針）として固定する。
 *
 * 守りたい要件:
 *   「ベータ版アップデートを受け取る」ON ＋ メニュー「アップデートを確認」→ beta 版へ更新。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const autoUpdaterSrc = fs.readFileSync(path.resolve(__dirname, "../auto-updater.js"), "utf8");
const menuSrc = fs.readFileSync(path.resolve(__dirname, "../menu.js"), "utf8");

describe("auto-updater.js — opt-in wiring", () => {
  it("純粋ポリシー resolveUpdaterFlags を使って更新フラグを決める", () => {
    expect(autoUpdaterSrc).toContain('require("./lib/update-policy")');
    expect(autoUpdaterSrc).toMatch(/resolveUpdaterFlags\(\s*appState\?\.allowBetaUpdates\s*\)/);
  });

  it("手動チェックは autoUpdater.checkForUpdates() の直前に opt-in を再評価する（順序保証）", () => {
    const applyIdx = autoUpdaterSrc.indexOf("await applyBetaOptIn()");
    const checkIdx = autoUpdaterSrc.indexOf("autoUpdater.checkForUpdates()");
    expect(applyIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(-1);
    // applyBetaOptIn の await がチェック呼び出しより前に位置すること
    expect(applyIdx).toBeLessThan(checkIdx);
  });

  it("checkForUpdates は async（opt-in の await を待ってから実チェックする）", () => {
    expect(autoUpdaterSrc).toMatch(/async function checkForUpdates\s*\(/);
  });

  it("#1785 回帰防止: autoUpdater.channel を代入しない（latest*.yml フォールバックに依存）", () => {
    expect(autoUpdaterSrc).not.toMatch(/autoUpdater\.channel\s*=/);
  });

  it("opt-in 変更の即時反映 reevaluateUpdateChannel を公開する", () => {
    expect(autoUpdaterSrc).toMatch(/module\.exports\s*=\s*{[^}]*reevaluateUpdateChannel/);
  });
});

describe("menu.js — 「アップデートを確認」導線", () => {
  it("メニュー項目が手動チェック checkForUpdates(true) を呼ぶ", () => {
    expect(menuSrc).toContain("アップデートを確認");
    expect(menuSrc).toMatch(/checkForUpdates\(true\)/);
  });
});
