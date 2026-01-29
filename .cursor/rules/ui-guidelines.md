# UI Guidelines

## Language and Localization

### Menu Language
- **All menu items must be in Japanese**
- This includes:
  - Application menu (macOS)
  - File menu (ファイル)
  - Edit menu (編集)
  - View menu (表示)
  - Window menu (ウィンドウ)
  - Help menu (ヘルプ)
  - All submenu items
  - Dialog boxes and notifications

### Standard Translations

#### Application Menu (macOS)
- About → について
- Services → サービス
- Hide → を隠す
- Hide Others → 他を隠す
- Show All → すべてを表示
- Quit → を終了

#### File Menu
- File → ファイル
- New → 新規
- Open → 開く
- Save → 保存
- Save As → 別名で保存
- Close → 閉じる

#### Edit Menu
- Edit → 編集
- Undo → 元に戻す
- Redo → やり直す
- Cut → 切り取り
- Copy → コピー
- Paste → 貼り付け
- Paste as Plain Text → プレーンテキストとして貼り付け
- Select All → すべて選択

#### View Menu
- View → 表示
- Reload → 再読み込み
- Force Reload → 強制再読み込み
- Toggle Developer Tools → 開発者ツールを切り替え
- Actual Size → 実際のサイズ
- Zoom In → 拡大
- Zoom Out → 縮小
- Toggle Full Screen → 全画面表示を切り替え

#### Window Menu
- Window → ウィンドウ
- Minimize → 最小化
- Zoom → 拡大/縮小
- Bring All to Front → すべてを手前に移動

#### Help Menu
- Help → ヘルプ
- Check for Updates → アップデートを確認
- Version → バージョン

### Dialog Messages

#### Update Messages
- Update Available → アップデート可能
- New version found → 新しいバージョンが見つかりました
- Downloading update → バックグラウンドでアップデートをダウンロードしています
- Update Ready → アップデート準備完了
- Update downloaded → アップデートのダウンロードが完了しました
- Restart to install → アプリを再起動してインストールしますか？
- Restart Now → 今すぐ再起動
- Later → 後で
- Update Error → アップデートエラー
- Error occurred → エラーが発生しました
- You are up to date → 最新バージョンです
- Current version → 現在のバージョン
- Development Mode → 開発モード
- Update disabled in development → 開発モードではアップデート機能は無効です

## Implementation Notes

- When adding new menu items or dialogs, always use Japanese text
- Keep translations consistent with existing patterns
- For technical terms, use katakana when appropriate (e.g., アップデート for "update")
- Maintain polite form in all user-facing text
