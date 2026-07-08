# illusions - 日本語小説エディタ

<div align="center" style="display: flex; flex-direction: column; gap: 12px; align-items: center; margin: 20px 0;">

![banner](/public/banner/github.png)

## ダウンロード / Downloads

<div style="display: flex; gap: 8px; height: 48px;">
  <a href="https://github.com/Iktahana/illusions/releases/latest" style="text-decoration: none; display: flex; align-items: center; border-radius: 4px; overflow: hidden;">
    <div style="background-color: #666; padding: 0 16px; height: 100%; display: flex; align-items: center; color: white; font-weight: bold; font-size: 14px; gap: 8px;">
      <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/apple.svg" width="20" height="20" alt="Apple" style="filter: brightness(0) invert(1);">
      Download For macOS
    </div>
  </a>
</div>
<br>
<div style="display: flex; gap: 8px; height: 48px;">
  <a href="https://apps.microsoft.com/detail/9mtc0ct16xg1" style="text-decoration: none; display: flex; align-items: center; border-radius: 4px; overflow: hidden;">
    <div style="background-color: #666; padding: 0 16px; height: 100%; display: flex; align-items: center; color: white; font-weight: bold; font-size: 14px; gap: 8px;">
      <img src="https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/windows.svg" width="20" height="20" alt="Windows" style="filter: brightness(0) invert(1);">
      Download For Windows
    </div>
  </a>
</div>
<br>

</div>

illusions は、日本語で小説を書くためのエディタです。  
縦書きと横書きの両方に対応し、執筆、推敲、校正、原稿整理までを一つの作業空間で進められます。

## 特徴

- 縦書きと横書きを切り替えながら執筆できる
- 日本語小説向けの組版と MDI 拡張記法を扱える
- AI 校正とルールベース校正で推敲を支援できる
- 辞書外語（固有名詞・造語など）をワンクリックでユーザー辞書に登録し、校正の誤検出を抑えられる
- 原稿統計情報（文字数・400字詰原稿用紙換算・選択テキストの原稿用紙換算枚数など）をリアルタイムで表示できる
- EPUB・PDF・DOCX 形式でエクスポートできる（EPUB はカバー画像・メタデータ・章分割・80 以上のページサイズに対応）
- 複数タブ・分割レイアウトで長編執筆を整理しやすい
- 組み込みターミナルでコピー・貼り付けショートカット（Windows・Linux は Ctrl+C / Ctrl+V）と右クリックメニューを使える
- 省電力モード：バックグラウンド中は自動保存間隔を延ばし、品詞ハイライトの形態素解析を一時停止してバッテリー消費を抑えられる
- アプリ内からバグ報告・フィードバックを送信できる
- 匿名の使用統計を収集し改善に役立てる（本文・ファイル名などの内容は含まず、設定からいつでもオフにできる）
- macOS / Windows / ブラウザで利用できる

## こんな人向け

- 日本語で小説や掌編を書きたい人
- 縦書きで原稿を確認しながら推敲したい人
- ルビや縦中横を含む原稿を扱いたい人
- 執筆と校正を同じ場所で完結させたい人

## 公式サイト

- Website: https://www.illusions.app
- Downloads: https://www.illusions.app/downloads

## ドキュメント

技術文書、仕様、開発ガイドは [`docs/`](docs/README.md) にまとめています。

- [ドキュメント入口](docs/README.md)
- [MDI ドキュメント](https://github.com/illusions-lab/MDI)

## 開発者向け

このリポジトリを開発用途で扱う場合は、まず [`docs/`](docs/README.md) を参照してください。  
AI 協作ルールは [CLAUDE.md](CLAUDE.md) にあります。

## ライセンスと問い合わせ

- License: [GNU Affero General Public License v3.0](LICENSE)
- Terms: [TERMS.md](TERMS.md)
- Issues: https://github.com/Iktahana/illusions/issues
- Website: https://www.illusions.app

---

<div align="right">
  <a href="https://www.art.nihon-u.ac.jp/education/department/literature/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/illusions-lab/.github/refs/heads/main/images/NUArt_colored.svg">
      <img src="https://raw.githubusercontent.com/illusions-lab/.github/refs/heads/main/images/NUArt.svg" height="64" alt="日本大学芸術学部">
    </picture>
  </a>
</div>
