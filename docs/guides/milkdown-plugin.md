# Milkdown エディター統合

Illusions のエディターは、文書構文、表示レイアウト、アプリ機能を別々の owner に分ける。

## Ownership

| 責務                                                        | Owner                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| MDI parse / serialize / schema                              | `@illusions-lab/milkdown-plugin-mdi` と `src/lib/document-format` の MDI adapter |
| Markdown / plain text                                       | `src/lib/document-format` の各 adapter                                           |
| writing mode / line length / vertical wheel                 | `@illusions-lab/milkdown-plugin-vertical-writing@1.0.1`                          |
| lint / POS / search / speech / heading / paragraph behavior | `src/lib/editor-page`                                                            |
| font / line-height / paragraph spacing / theme              | `src/app/editor-typography.css` と editor component                              |

`milkdown-plugin-mdi` と `milkdown-plugin-vertical-writing` は Milkdown に並列導入する。互いを import
せず、vertical-writing layer に document format や MDI IR を渡さない。

## Writing mode

公開 CSS は `src/app/globals.css` から明示的に読み込む。editor 初期化では一度だけ
`verticalWriting({ mode, lineLength })` を登録し、その後の変更は action で行う。

```ts
editor.action(changeWritingMode("vertical-rl"));
editor.action(changeLineLength(40));
editor.action(changeLineLength(null));
```

mode や line length を `useEditor` の再構築 dependency に含めてはいけない。切替時も同じ
EditorView を維持し、document、selection、IME composition、undo/redo history を保持する。

`horizontal-tb` と `vertical-rl` が現在の UI の選択肢である。`vertical-lr` は package API として
利用可能だが、Illusions の UI にはまだ公開しない。

plugin が付与する `.milkdown-vertical-writing`、`data-writing-mode`、`data-line-length` と公開 CSS が
layout と scroll container を所有する。アプリ側で wheel event、logical scroll progress、writing-mode、
line-length sizing を再実装しない。

## Application features

旧 internal Japanese-novel package は廃止した。残すべき機能は次の場所へ移した。

- `src/lib/editor-page/novel-editor-features`: heading anchor、全角 Markdown 互換、会話文／hard break の補助
- `src/lib/editor-page/linting-plugin`: 校正 decoration と worker 接続
- `src/lib/editor-page/pos-highlight`: 品詞 highlight
- `src/lib/editor-page/paragraph-helpers.ts`: editor feature 共通の段落位置計算
- `src/lib/document-format/remark-plain-text.ts`: plain-text adapter 専用入力処理

これらは writing mode を所有せず、`.mdi` / `.md` / `.txt` から同じ presentation layer として利用する。

## 検証

- mode / line length action 後も EditorView identity、document、selection、history が変わらない
- vertical wheel と nested scroller の優先順位が package 契約どおりである
- single / split pane の auto line length は pane ごとに独立する
- `.mdi` / `.md` / `.txt` の adapter が writing-mode plugin に依存しない
- search、lint、speech の jump / scroll が plugin root を scroll container として利用する
