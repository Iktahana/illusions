## ⚠️ Copyright Notice 著作権に関する通知

[EN]

This project welcomes genuine open-source exchange and technical collaboration. However, we strictly prohibit ANY unauthorized use of AI (including but not limited to feeding source code, architectural logic, or page screenshots into LLMs/AI tools) for any unauthorized analysis, code laundering, or reproducing similar results.

For details on AI usage restrictions, how to obtain proper authorization (including for commercial projects), and the **"Retroactive Authorization & Amnesty Clause" for past users**, please ensure you thoroughly read the full **[NOTICE document](./NOTICE)** before downloading, copying, or referencing this project.

> 🛡️ **Evidence Preservation & Retroactive Amnesty:**
> We have already preserved evidence regarding products in the market suspected of plagiarizing this project's achievements. If you have already fed our content into AI for analysis or replication prior to this notice, please refer to the **[NOTICE document](./NOTICE)** and contact us immediately to apply for retroactive authorization. **We promise to waive all past legal liabilities for applicants who proactively seek retroactive authorization.** Please respect the true open-source spirit.

Thank you for your cooperation.

[JP]

本プロジェクトは、健全なオープンソースの交流と技術協力を歓迎します。しかし、無許可でAIを利用し（ソースコード、設計ロジック、ページのスクリーンショット等のプロジェクト成果物をLLM/AIツールに入力することを含みますが、これらに限定されません）、あらゆる無許可の分析、コードロンダリング、または類似成果物の生成を行う行為は**厳格に禁止**されています。

AI利用の制限事項、正式な利用許諾の取得方法（商用プロジェクトを含む）、および既存の利用者向けの「遡及的許諾および免責（アムネスティ）条項」に関する詳細については、本プロジェクトをダウンロード、複製、または参照する前に、必ず完全版の[NOTICE（警告声明ファイル）](./NOTICE)を通読してください。

> 🛡️ **証拠保全および遡及的対応について：**
> 当方は、市場において本プロジェクトの成果を盗用した疑いのある製品について、すでに関連する証拠の保全を完了しております。本通知の公開前に、関連成果物をAIに入力して分析や模倣を行ってしまった場合は、速やかに[NOTICEファイル](./NOTICE)の記載に従い、私たちに連絡して「追加利用許諾」を申請してください。**自発的に許諾の補完手続きを行った申請者に対しては、過去の法的責任を追及しないことを約束します。**

オープンソースの精神を尊重していただきますようお願いいたします。

---

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
- [MDI ドキュメント](docs/MDI/README.md)

## 開発者向け

このリポジトリを開発用途で扱う場合は、まず [`docs/`](docs/README.md) を参照してください。  
AI 協作ルールは [CLAUDE.md](CLAUDE.md) にあります。

## ライセンスと問い合わせ

- License: [GNU Affero General Public License v3.0](LICENSE)
- Terms: [TERMS.md](TERMS.md)
- Issues: https://github.com/Iktahana/illusions/issues
- Website: https://www.illusions.app
