/**
 * Plugin configuration options for milkdown-plugin-japanese-novel.
 */

export interface JapaneseNovelOptions {
  /** Enable vertical writing mode (縦書き). */
  isVertical?: boolean
  /** Show manuscript-style grid lines (原稿用紙). */
  showManuscriptLine?: boolean
  /** Enable tate-chu-yoko (縦中横) for digits and punctuation. */
  enableTcy?: boolean
  /** Enable Ruby (振仮名) syntax {base|ruby}. */
  enableRuby?: boolean
}

export const defaultJapaneseNovelOptions: Required<JapaneseNovelOptions> = {
  isVertical: false,
  showManuscriptLine: false,
  enableTcy: true,
  enableRuby: true,
}
