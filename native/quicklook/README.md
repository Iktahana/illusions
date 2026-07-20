# MDI Quick Look Preview Extension

Finder / Spotlight 上で `.mdi` ファイルをスペースキーでプレビューするための
**Quick Look Preview Extension**（`.appex`）です。

## なぜ `.appex` なのか（旧 `.qlgenerator` からの移行）

旧実装は QuickLook Generator (`.qlgenerator`, `GeneratePreviewForURL`) を使っていましたが、
これは macOS 10.15 で deprecated となり、**Big Sur 以降（特に Apple Silicon）では
`quicklookd` がロードしません**。そのためプレビューは一切表示されませんでした。

現行 macOS でプレビューを提供する唯一の方法は、`QLPreviewingController` に準拠した
principal class を持つ Quick Look Preview Extension を `<App>.app/Contents/PlugIns/`
に埋め込むことです。

## 動作に必要な 3 要素

1. **拡張本体** (`MDIQuickLook.appex`)
   - `Source/PreviewViewController.swift` — `QLPreviewingController`。ファイルを読み、
     `MarkdownRenderer` で HTML 化し `WKWebView` に表示
   - `Source/MarkdownRenderer.swift` — Markdown → HTML（macOS 12+ は `AttributedString`、
     以前は escaped plain text）
   - `Info.plist` — `NSExtension`（`com.apple.quicklook.preview`）+
     `QLSupportedContentTypes = app.illusions.mdi`
   - エントリポイントは Foundation の `NSExtensionMain`（`scripts/build-quicklook.sh` が
     `-e _NSExtensionMain` でリンク、universal binary を `lipo` で生成）

2. **UTI の export**（`package.json` の `mac.extendInfo.UTExportedTypeDeclarations`）
   - ホストアプリが `app.illusions.mdi`（`public.plain-text` 準拠、拡張子 `mdi`）を
     export しないと、`.mdi` は動的 UTI (`dyn... = public.data`) に解決され、
     拡張の `QLSupportedContentTypes` に**永遠にマッチしません**。これが旧構成で
     プレビューが出なかったもう一つの根本原因です。

3. **PlugIns への埋め込み + 署名**（`scripts/embed-quicklook.js`、afterPack フック）
   - 署名前に `.appex` を `Contents/PlugIns/MDIQuickLook.appex` へコピーし、afterPack
     フック内で **Developer ID + hardened runtime + secure timestamp** で署名する。
   - **なぜ afterPack で自前署名するか**: electron-builder の署名ステップ
     (@electron/osx-sign / MacTargetHelper) は `Contents/PlugIns` 配下を
     **既定で署名対象から除外**する（`ignore` コールバック内の
     `file.startsWith("/Contents/PlugIns", appPath.length)`）。そのため
     `extraFiles` でも `mac.binaries` でも appex は署名されず、親アプリ署名・
     notarization が「code object is not signed at all」で失敗する。afterPack は
     アプリ署名より前に走るので、ここで CSC_LINK/CSC_KEY_PASSWORD から一時
     keychain を作って appex を署名しておけば、electron-builder は PlugIns を
     触らないため署名が保持され、親の封緘が成功する。
   - `~/Library/QuickLook` への手動コピーや `qlmanage -r` は不要（pluginkit が自動検出）。

## ビルド

```bash
npm run build:quicklook   # macOS のみ。build/quicklook/MDIQuickLook.appex を生成
```

CI（`.github/workflows/build.yml`）では `electron:build` の前に実行されます。

## ローカル検証メモ

完全な Finder プレビューの確認には **Developer ID 署名済みビルドを /Applications に
インストール**する必要があります。ad-hoc 署名のローカルビルドでは、export した UTI が
LaunchServices に `untrusted` 扱いされ `.mdi` が正しい UTI に解決されないため、
プレビューは出ません（バンドル構造・エントリポイント・署名自体の検証は可能）。
