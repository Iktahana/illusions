# Milkdown エディター統合

Illusions のエディターは、文書構文、表示レイアウト、アプリ機能を別々の owner に分ける。

## Ownership

| 責務                                           | Owner                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| MDI parse / serialize / schema                 | `@illusions-lab/milkdown-plugin-mdi` と `src/lib/document-format` の MDI adapter |
| Markdown / plain text                          | `src/lib/document-format` の各 adapter                                           |
| writing mode / line length / vertical wheel    | `@illusions-lab/milkdown-plugin-vertical-writing@1.0.1`                          |
| lint / POS / search / speech UI                | `src/lib/editor-page`                                                            |
| MDI block order / kind / position / source map | `@illusions-lab/mdi`                                                             |
| font / line-height / paragraph spacing / theme | `src/app/editor-typography.css` と editor component                              |

`milkdown-plugin-mdi` と `milkdown-plugin-vertical-writing` は Milkdown に並列導入する。互いを import
せず、vertical-writing layer に document format や MDI IR を渡さない。

## 現在の editor core 完了境界

最小 core が直接担当するのは次だけである。

- `.mdi` / `.md` / `.txt` ごとの adapter 選択
- 初期値、変更通知、外部内容置換、同期 flush
- history / clipboard
- MDI package（`.mdi` のみ）
- vertical-writing package（全形式共通）

検索、選択範囲、校正 decoration、品詞 highlight、音声追従、Ruby / 縦中横編集 command、toolbar、
context menu、Bubble menu、選択文字数は UI shell が残っていても editor core には未接続である。これらは
設計確定後に個別 extension と integration test を伴って再接続する。

### 形式分離 matrix

| source               | `.mdi`                   | `.md`                         | `.txt`  |
| -------------------- | ------------------------ | ----------------------------- | ------- |
| `# heading`          | heading                  | heading                       | literal |
| `{東京\|とうきょう}` | Ruby atom                | literal                       | literal |
| `^12^`               | TCY mark                 | literal                       | literal |
| `[[blank]]`          | semantic `mdiBlank` node | escaped literal serialization | literal |
| `*強調*`             | emphasis                 | emphasis                      | literal |

Save As は source を変換する操作ではない。`.mdi` / `.md` / `.txt` の六方向すべてで現在の source bytes を
そのまま書き、保存成功後に destination extension から次回 editor adapter を決める。

### upstream MDI block support

`@illusions-lab/milkdown-plugin-mdi@0.2.0` から空白段落、改頁／改丁、字下げ／地付きが semantic
Milkdown block node または paragraph attribute として提供される。Illusions は package の schema と
logical CSS をそのまま使用し、fallback parser / schema / serializer を追加しない。blank、三種の
pagebreak、indent、bottom は実 package の parse → DOM → canonical serialize conformance test で固定する。

### Rust-owned block positions

MDI の機械編集位置は `getMdiTextBlocks()` が返す source-order `MdiTextBlock.index` と、一基準の
Unicode grapheme 座標 `block:grapheme` だけを使う。heading、paragraph、list item、blockquote、code、
table、footnote、HTML、other は同じ列に属する。React、ProseMirror traversal、CSS counter で別の
「段落番号」を算出してはいけない。

公開中の plugin は Rust block metadata と editable Milkdown node / decoration の対応をまだ提供しない。
この bridge は [upstream #10](https://github.com/illusions-lab/milkdown-plugin-mdi/issues/10) で追跡する。
対応するまでは番号表示を無効化し、検索結果にも DOM 由来の paragraph number や line number を
block position として表示しない。bridge は `@illusions-lab/mdi` の index、kind、range、span、source
map、version metadata を原樣に運ぶだけとし、新しい座標、ID、block model を定義しない。

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

## 延期中の application features

旧 internal Japanese-novel package は廃止した。application service や UI 設定が残っていても、それを
Milkdown decoration / command として接続済みとは扱わない。再導入時も writing mode を所有させず、
`.mdi` / `.md` / `.txt` の意味論を混在させない。

## 検証

- mode / line length action 後も EditorView identity、document、selection、history が変わらない
- vertical wheel と nested scroller の優先順位が package 契約どおりである
- single / split pane の auto line length は pane ごとに独立する
- `.mdi` / `.md` / `.txt` の adapter が writing-mode plugin に依存しない
- editor view ready 前に writing-mode / line-length / external replacement action を実行しない
- format 切替時に旧 EditorView の ready 状態を新 editor へ流用しない
- 実 package mount で edit / external replacement / synchronous flush が canonical source を返す
- Save As 六方向で source bytes を変えず destination adapter route だけを更新する
- package graph に plugin 間依存、複数 Milkdown runtime、renderer からの private `mdi-core` import がない

品質閘は `format:check`、`lint`、`type-check`、`check:boundaries`、`test:coverage`、
`build:electron-renderer`、`bundle:electron`、`check:electron-artifacts` をすべて通す。
