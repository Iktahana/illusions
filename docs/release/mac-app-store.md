# Mac App Store（MAS）上架 計画・進捗

> このドキュメントは MAS 上架作業のトラッキング用。直販（DMG + notarization）は維持したまま、`mas` ビルドターゲットを追加する方針。

## 背景・方針

illusions は現在 Developer ID 署名 + notarization で DMG/ZIP を GitHub Releases から直販し、`electron-updater` で自動更新している。MAS は別チャネルで App Sandbox 対応が必須。

確定方針:

- Apple Developer Program 契約済み
- **ターミナル機能（node-pty / シェル spawn）は MAS 版で無効化**（直販版は維持）
- **直販と MAS を併存**。ビルドターゲットを分け、機能差はビルドフラグで吸収

ゴール: 既存の直販フローを壊さずに `mas` ターゲットを追加し、サンドボックス準拠の MAS ビルドを App Store Connect へ提出できる状態にする。

## ブロッカー / 影響範囲

| 項目 | 現状 | MAS での問題 | 対応 |
| --- | --- | --- | --- |
| ターミナル | `electron/ipc/pty-ipc.js` が node-pty で任意シェル spawn | 任意実行ファイル起動は審査却下リスク最大 | MAS ビルドで機能ごと除外 |
| QuickLook | 実行時に `~/Library/QuickLook/` へ `.qlgenerator` をコピー（`electron/quick-look.js`） | サンドボックスで当該ディレクトリに書込不可 | MAS 版は同梱省略（将来 appex で再実装） |
| 自動更新 | `electron-updater`（`electron/auto-updater.js`） | MAS では禁止 | `process.mas` 検出でスキップ |
| entitlements | `allow-unsigned-executable-memory` / `disable-library-validation` 等（`build/entitlements.mac.plist`） | MAS では App Sandbox + 別 entitlements が必要 | MAS 専用 plist を新規作成 |
| 署名・notarize | Developer ID + `scripts/notarize.js`（afterSign） | MAS は Apple Distribution 証明書 + プロビジョニングプロファイル。notarize 不要 | afterSign を MAS 時スキップ |
| VFS フォルダ永続 | `approved-vfs-paths.json` に生パス保存（`electron/ipc/vfs-ipc.js`） | サンドボックスで再起動後に生パス再オープン不可 | security-scoped bookmark を実装 |
| 本番ロード元 | 本番で `http://localhost:3010` から読込 | ローカル listen は要検証 | サンドボックスで起動検証、必要 entitlement 付与 |
| データ保存先 | `~/Library/Application Support/illusions/` | サンドボックスでコンテナへ自動リダイレクト（透過） | コード変更不要。直販版とデータ非共有を周知 |
| ネットワーク | OpenAI/Anthropic/Google・GitHub・OAuth | `network.client` entitlement 必要 | entitlement 付与 |

## フェーズ

### Phase A — Apple 側セットアップ（手動）

1. App ID `com.iktahana.illusions` 登録、App Sandbox 有効化
2. 証明書 2 種発行: Apple Distribution / Mac Installer Distribution
3. Mac App Store distribution プロビジョニングプロファイル発行 → `build/illusions.provisionprofile`（コミットしない / CI secret 化）
4. App Store Connect アプリレコード作成（名称・Bundle ID・SKU）
5. メタデータ準備（日本語説明・キーワード・サポート URL・**プライバシーポリシー URL 必須**・価格・レーティング）
6. App Privacy 申告（外部 AI API 送信・OAuth アカウント情報）

### Phase B — コード / ビルド設定変更

- B-1. MAS ビルドフラグ（`MAS_BUILD=1` / `process.mas`）導入、`electron:build:mas` script 追加
- B-2. electron-builder に `mas` ターゲット追加（既存 dmg/zip 維持）。専用 entitlements・provisioningProfile・`hardenedRuntime:false`・`type:distribution`。afterSign は MAS 時スキップ
- B-3. MAS 専用 entitlements 作成: `build/entitlements.mas.plist`（app-sandbox / network.client / files.user-selected.read-write / files.bookmarks.app-scope / allow-jit）+ `build/entitlements.mas.inherit.plist`（app-sandbox / inherit）。`allow-unsigned-executable-memory` / `disable-library-validation` は入れない
- B-4. 機能ゲーティング: ターミナル（pty-ipc）／QuickLook（quick-look.js）／auto-updater を MAS 時無効化
- B-5. VFS フォルダの security-scoped bookmark 対応（`vfs-ipc.js` / `lib/vfs/`）— MAS でフォルダ機能を成立させる必須作業
- B-6. localhost ロードのサンドボックス検証（`electron/main.js`）

### Phase C — ビルド & ローカル検証

- `MAS_BUILD=1` ビルドで `.app`/`.pkg` 生成、`codesign -dv --entitlements -` で確認
- サンドボックス実機検証: ファイル開閉・VFS（再起動後復元）・ストレージ・ネットワーク・OAuth・辞書 DL
- ターミナル/QuickLook 無効、他機能に影響なしを確認
- 直販ビルドの回帰確認
- Transporter / notarytool 相当でアップロードバリデーション

### Phase D — 提出 & 審査

- Transporter で `.pkg` アップロード → メタデータ・スクリーンショット投入 → App Privacy・輸出コンプライアンス回答 → 審査提出

### Phase E — CI/CD 統合（App Store リリース自動化）

既存 `.github/workflows/build.yml`（`Desktop Build and Release`）に MAS 用ジョブを並列追加する。現状は Developer ID 署名 + notarization → GitHub Releases を自動化済み。MAS は別資格情報が必要。

自動化の範囲:

| 段階 | 自動化 |
| --- | --- |
| MAS ビルド（`.pkg` 生成・署名・プロファイル埋め込み） | ✅ 完全自動（electron-builder `mas` ターゲット） |
| App Store Connect へアップロード | ✅ 完全自動（App Store Connect API キー認証） |
| 「審査に提出」 | ⚠️ fastlane 等で自動化可だが、誤リリース防止のため手動承認を残すのが一般的 |
| 審査そのもの | ❌ Apple 側（CI では待てない） |

追加で必要な GitHub Secrets:

- `MAS_CSC_LINK` / `MAS_CSC_KEY_PASSWORD` — **Apple Distribution** 証明書（アプリ署名。Developer ID とは別物）
- `CSC_INSTALLER_LINK` / `CSC_INSTALLER_KEY_PASSWORD` — **Mac Installer Distribution** 証明書（`.pkg` 署名）
- `MAS_PROVISIONING_PROFILE` — プロビジョニングプロファイル（base64 → CI で `build/illusions.provisionprofile` に復元）
- `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_API_KEY` — App Store Connect API キー（`.p8` base64、アップロード認証）

ジョブ構成（イメージ）:

- トリガー: **タグ push（`v*`）時のみ**（直販リリースと同タイミングで正式版だけ App Store Connect へ）。移行初期は `workflow_dispatch` 手動起動が安全
- ステップ: checkout → npm install → プロファイル復元 → `MAS_BUILD=1 npm run electron:build:mas` → `xcrun altool --upload-app`（または fastlane `deliver` / Transporter CLI）
- 既存の Developer ID 用 secrets（`CSC_LINK` 等）とは**別管理**

## リスク / 未確定事項

- `disable-library-validation` 無しで better-sqlite3 等 native の再署名が library validation を通るか要実機確認
- 本番の localhost HTTP ロードのサンドボックス挙動（必要なら `file://` 化）
- MAS 版では `.mdi` の Finder QuickLook プレビューが無くなる（将来 appex で復活可）
- MAS 版はコンテナ隔離で直販版とストレージ非共有

## チェックリスト

- [ ] Phase A: Apple 側セットアップ完了
- [ ] Phase B: コード / ビルド設定変更
- [ ] Phase C: ローカルビルド & サンドボックス実機検証 / 直販回帰確認
- [ ] Phase D: Transporter バリデーション通過・App Store 審査提出
- [ ] Phase E: CI/CD 統合（タグ push で MAS ビルド → App Store Connect 自動アップロード）
