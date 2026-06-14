/**
 * milkdown-plugin-japanese-novel の設定オプション
 */

export interface JapaneseNovelOptions {
  /** 縦書きを有効化する */
  isVertical?: boolean;
  /** 原稿用紙風の罫線を表示する */
  showManuscriptLine?: boolean;
  /** 縦中横を有効化する（^...^ 記法） */
  enableTcy?: boolean;
  /** ルビを有効化する（{base|ruby} 記法） */
  enableRuby?: boolean;
  /** 改行禁止を有効化する（[[no-break:text]] 記法） */
  enableNoBreak?: boolean;
  /** カーニング指定を有効化する（[[kern:amount:text]] 記法） */
  enableKern?: boolean;
  /** 明示改行を有効化する（[[br]] 記法） */
  enableMdiBreak?: boolean;
  /**
   * プレーンテキスト（.txt）モード。`MilkdownEditor` が `remarkPlainTextPlugin`
   * を導入し、`*` `#` `**` 等を Markdown ではなくリテラル文字として扱う場合に
   * `true`。クリップボード書き出し時は Markdown 除去・MDI 変換を一切行わず、
   * 選択範囲のテキストをそのままコピーする。
   */
  plainText?: boolean;
}

export const defaultJapaneseNovelOptions: Required<JapaneseNovelOptions> = {
  isVertical: false,
  showManuscriptLine: false,
  enableTcy: true,
  enableRuby: true,
  enableNoBreak: true,
  enableKern: true,
  enableMdiBreak: true,
  plainText: false,
};
