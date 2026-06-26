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

/**
 * 実行中バージョンが「公開フィードを持たないチャンネル」のビルドかを判定する。
 *
 * build.yml の `release` ジョブは dev/alpha ブランチでは実行されない
 * （`github.ref != 'refs/heads/dev'`、alpha も同様に Release を作らない）。
 * そのため `X.Y.Z-dev` / `X.Y.Z-alpha` の packaged ビルドは CI 専用成果物であり、
 * 追従すべき GitHub Release が存在しない。にもかかわらず auto-updater を走らせると、
 * 「自分より古い最新安定版/beta」を down-/cross-grade として誤って提案・ダウンロード
 * してしまう（`isDev` は NODE_ENV/ELECTRON_DEV 環境変数依存で、packaged dev 版では
 * false になりガードできない）。
 *
 * beta（`X.Y.Z-beta.YYYYMMDD.N`）は公開フィードを持つ正規チャンネルなので **対象外**
 * （更新を継続する）。安定版（接尾辞なし）も対象外。
 *
 * @param {unknown} version - app.getVersion() の戻り値（文字列以外は false 扱い）
 * @returns {boolean} dev/alpha チャンネルのビルドなら true
 */
function isUnpublishedChannelVersion(version) {
  if (typeof version !== "string") return false;
  // build.yml は dev/alpha で bare な接尾辞 `-dev` / `-alpha` のみを付与する。
  // 末尾、または将来 `.` 区切りの識別子が続く場合の両方を許容する。
  return /-(?:dev|alpha)(?:\.|$)/.test(version);
}

module.exports = { resolveUpdaterFlags, isUnpublishedChannelVersion };
