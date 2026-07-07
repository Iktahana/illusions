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

/**
 * illusions 1.2 系列の sunset 判定に使う下限バージョン（1.3.0 正式版以降）。
 */
const SUNSET_MIN_VERSION = { major: 1, minor: 3 };

/**
 * "X.Y.Z..." から major/minor だけを取り出す。パース不能なら null。
 * @param {unknown} version
 * @returns {{ major: number, minor: number } | null}
 */
function parseMajorMinor(version) {
  if (typeof version !== "string") return null;
  const match = version.match(/^(\d+)\.(\d+)\.\d+/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** major/minor のみで比較する（patch は無視）。a<b なら負、a>b なら正、等しければ 0。 */
function compareMajorMinor(a, b) {
  return a.major !== b.major ? a.major - b.major : a.minor - b.minor;
}

/**
 * macOS 限定の sunset 検出。
 *
 * 1.2.x を実行中のユーザーが 1.3.0 以降の「正式版」(プレリリースではない) を検出したら、
 * 通常の auto-update フロー（ダウンロード提案）ではなく sunset 通知に置き換える。
 * macOS は過去に notarization/bundle ID 変更で auto-updater が追従できなかったことがあり
 * (#2019 revert)、確実に手動ダウンロードへ誘導する必要があるため他プラットフォームとは
 * 扱いを分ける。beta プレリリース (`1.3.0-beta.*`) はまだ「正式版」ではないので対象外。
 *
 * @param {{ platform: unknown, currentVersion: unknown, availableVersion: unknown }} params
 * @returns {boolean}
 */
function isSunsetDetected({ platform, currentVersion, availableVersion }) {
  if (platform !== "darwin") return false;
  if (typeof availableVersion !== "string" || availableVersion.includes("-")) return false;

  const current = parseMajorMinor(currentVersion);
  const available = parseMajorMinor(availableVersion);
  if (!current || !available) return false;

  return (
    compareMajorMinor(current, SUNSET_MIN_VERSION) < 0 &&
    compareMajorMinor(available, SUNSET_MIN_VERSION) >= 0
  );
}

module.exports = { resolveUpdaterFlags, isUnpublishedChannelVersion, isSunsetDetected };
