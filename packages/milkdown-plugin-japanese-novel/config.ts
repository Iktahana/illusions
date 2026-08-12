/**
 * milkdown-plugin-japanese-novel の設定オプション
 */

export interface JapaneseNovelOptions {
  /** 縦書きを有効化する */
  isVertical?: boolean;
  /** 原稿用紙風の罫線を表示する */
  showManuscriptLine?: boolean;
  /**
   * プレーンテキスト（.txt）モード。`MilkdownEditor` が `remarkPlainTextPlugin`
   * を導入し、`*` `#` `**` 等を Markdown ではなくリテラル文字として扱う場合に
   * `true`。
   */
  plainText?: boolean;
}

export const defaultJapaneseNovelOptions: Required<JapaneseNovelOptions> = {
  isVertical: false,
  showManuscriptLine: false,
  plainText: false,
};
