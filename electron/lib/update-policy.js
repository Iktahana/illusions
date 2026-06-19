/**
 * Pure auto-update channel policy (#1782 / #1785).
 *
 * electron / electron-updater に一切依存しない純粋関数として切り出し、単体テスト可能に
 * する（lib/editor-page/power-policy.ts と同じ方針）。autoUpdater への副作用（プロパティ
 * 代入や checkForUpdates 呼び出し）は呼び出し側 electron/auto-updater.js が担う。
 *
 * 重要: ここでは `channel` を一切決めない。GitHub provider は beta プレリリースの
 * `latest*.yml` にフォールバックして更新を解決するため、`autoUpdater.channel` は
 * 未設定のままにする（channel="beta" を立てると beta-*.yml 404 で失敗する）。
 */

/**
 * beta opt-in フラグから autoUpdater に設定すべき更新挙動を決める。
 *
 * @param {unknown} allowBetaUpdates - AppState.allowBetaUpdates（真偽値以外は false 扱い）
 * @returns {{ allowPrerelease: boolean, allowDowngrade: boolean }}
 *   - allowPrerelease: ON のとき true（最新 beta プレリリースを受信）
 *   - allowDowngrade : OFF のとき true（プレリリース実行中でも最新安定版へ戻す）
 */
function resolveUpdaterFlags(allowBetaUpdates) {
  const allowBeta = allowBetaUpdates === true;
  return {
    allowPrerelease: allowBeta,
    allowDowngrade: !allowBeta,
  };
}

module.exports = { resolveUpdaterFlags };
