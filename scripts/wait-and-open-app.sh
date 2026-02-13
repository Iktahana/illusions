#!/bin/bash
# GitHub Actions ビルド完了を待機し、アプリを自動的に開くスクリプト

set -e

# 設定
BRANCH="dev"
CHECK_INTERVAL=30  # チェック間隔（秒）
WAIT_AFTER_COMPLETION=60  # ビルド完了後の待機時間（秒）
APP_NAME="illusions.app"

echo "🔍 GitHub Actions ビルド監視を開始します..."
echo "ブランチ: $BRANCH"
echo "チェック間隔: ${CHECK_INTERVAL}秒"
echo ""

# 最新のビルド実行IDを取得
get_latest_run_id() {
  gh run list --branch "$BRANCH" --workflow "Desktop Build and Release" --limit 1 --json databaseId --jq '.[0].databaseId'
}

# ビルドステータスを取得
get_run_status() {
  local run_id=$1
  gh run view "$run_id" --json status,conclusion --jq '.status'
}

# ビルド結果を取得
get_run_conclusion() {
  local run_id=$1
  gh run view "$run_id" --json conclusion --jq '.conclusion'
}

# 最新のビルドIDを取得
LATEST_RUN_ID=$(get_latest_run_id)

if [ -z "$LATEST_RUN_ID" ]; then
  echo "❌ エラー: ビルド実行が見つかりません"
  exit 1
fi

echo "📋 監視対象ビルド ID: $LATEST_RUN_ID"
echo ""

# ビルド完了まで待機
while true; do
  STATUS=$(get_run_status "$LATEST_RUN_ID")

  if [ "$STATUS" = "completed" ]; then
    CONCLUSION=$(get_run_conclusion "$LATEST_RUN_ID")
    echo ""
    echo "✅ ビルドが完了しました！"
    echo "結果: $CONCLUSION"
    echo ""

    if [ "$CONCLUSION" != "success" ]; then
      echo "⚠️  警告: ビルドが失敗しました（$CONCLUSION）"
      echo "詳細を確認してください:"
      gh run view "$LATEST_RUN_ID" --web
      exit 1
    fi

    break
  fi

  echo "⏳ ビルド進行中... ステータス: $STATUS (次回チェック: ${CHECK_INTERVAL}秒後)"
  sleep "$CHECK_INTERVAL"
done

# ビルド完了後の待機
echo "⏱  ${WAIT_AFTER_COMPLETION}秒待機中..."
for i in $(seq "$WAIT_AFTER_COMPLETION" -1 1); do
  printf "\r残り: %02d秒" "$i"
  sleep 1
done
echo ""
echo ""

# アーティファクトをダウンロード
echo "📦 ビルドアーティファクトをダウンロード中..."
DOWNLOAD_DIR="/tmp/illusions-build-$$"
mkdir -p "$DOWNLOAD_DIR"

gh run download "$LATEST_RUN_ID" --dir "$DOWNLOAD_DIR"

# .app ファイルを探す
APP_PATH=$(find "$DOWNLOAD_DIR" -name "$APP_NAME" -type d | head -1)

if [ -z "$APP_PATH" ]; then
  echo "❌ エラー: $APP_NAME が見つかりません"
  echo "ダウンロードされたファイル:"
  ls -R "$DOWNLOAD_DIR"
  exit 1
fi

echo "✅ アプリが見つかりました: $APP_PATH"
echo ""

# ZIP ファイルの場合は展開
if [ -f "$DOWNLOAD_DIR"/*.zip ]; then
  echo "📦 ZIP ファイルを展開中..."
  cd "$DOWNLOAD_DIR"
  for zip_file in *.zip; do
    unzip -q "$zip_file"
  done

  # 再度 .app を探す
  APP_PATH=$(find "$DOWNLOAD_DIR" -name "$APP_NAME" -type d | head -1)
fi

# アプリを開く
echo "🚀 $APP_NAME を起動します..."
echo ""

open "$APP_PATH"

echo "✨ 完了！アプリが起動しました。"
echo ""
echo "📝 注意事項:"
echo "  - 初回起動時は macOS のセキュリティ確認が表示される場合があります"
echo "  - Gatekeeper の警告が出た場合: システム設定 > プライバシーとセキュリティ で許可してください"
echo ""
echo "ダウンロードディレクトリ: $DOWNLOAD_DIR"
echo "（不要な場合は削除してください: rm -rf $DOWNLOAD_DIR）"
