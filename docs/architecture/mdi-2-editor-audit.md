---
title: MDI 2.0 エディター統合監査
slug: mdi-2-editor-audit
type: architecture
status: active
updated: 2026-08-13
owner: maintainers
---

# MDI 2.0 エディター統合監査

この文書は #2286、#2287、#2288 の release gate と、2026-08-13 時点の実装範囲を記録する。

## 確定した完了境界

旧 editor を機能ごと移植する方針は採らず、公式 package で最小コアを再構築した。既存 UI shell は
残すが、追加 editor feature は基礎完成後に一つずつ再接続する。したがって本監査の blocker は
「最小編集／保存契約の欠落」「MDI／layout ownership 違反」「データ破壊」であり、延期を明記した
追加 feature が未接続であること自体ではない。

## Ownership 結果

| 領域                                             | Owner                                                   | 結果 |
| ------------------------------------------------ | ------------------------------------------------------- | ---- |
| MDI parse / diagnostics / projection             | `@illusions-lab/mdi` / Rust                             | pass |
| MDI Milkdown schema / canonical save             | `@illusions-lab/milkdown-plugin-mdi`                    | pass |
| writing mode / line length / wheel               | `@illusions-lab/milkdown-plugin-vertical-writing@1.0.1` | pass |
| `.md`                                            | CommonMark + GFM adapter                                | pass |
| `.txt`                                           | plain-text adapter                                      | pass |
| save / tab / file watcher / export orchestration | Illusions                                               | pass |

`packages/milkdown-plugin-japanese-novel`、独自 MDI schema / serializer、旧 vertical wheel helper、重複
layout CSS は削除済み。renderer source は private `@illusions-lab/mdi-core` を直接 import しない。

## Format isolation matrix

| Input                | `.mdi`                                | `.md`    | `.txt`  |
| -------------------- | ------------------------------------- | -------- | ------- |
| `# heading`          | heading                               | heading  | literal |
| `{東京\|とうきょう}` | ruby                                  | literal  | literal |
| `^12^`               | TCY                                   | literal  | literal |
| `[[blank]]`          | Rust compatibility / canonicalization | literal  | literal |
| `*強調*`             | emphasis                              | emphasis | literal |

adapter unit test、Milkdown integration test、statistics / readability / outline test で format を明示する。
デフォルト MDI として暗黙処理する API は新設しない。

Save As は六方向（MDI / Markdown / TXT の相互変換）で destination extension から adapter identity を
更新する。保存時には source を暗黙変換・削除せず、新しい file path により editor が remount され、
新 adapter で decode される。

## 最小 editor matrix

| 契約                                           | 状態 | 主な証拠                                                     |
| ---------------------------------------------- | ---- | ------------------------------------------------------------ |
| open / live edit / flush / save                | pass | adapter integration、save executor、flush registration tests |
| undo / redo                                    | pass | vertical-writing integration history test                    |
| clipboard                                      | pass | Milkdown official clipboard plugin、analytics boundary test  |
| external reload                                | pass | pending external content wiring、file watcher tests          |
| horizontal / vertical hot switch               | pass | EditorView identity / selection / history test               |
| line length / vertical wheel / nested scroller | pass | official plugin integration tests                            |
| `.mdi` / `.md` / `.txt` separation             | pass | format matrix / round-trip tests                             |
| browser MDI WASM startup                       | pass | root runtime gate、retry test、browser export-condition test |
| Electron / MAS MDI WASM materialization        | pass | bundle smoke、packaging tests                                |
| HTML / PDF / EPUB / DOCX / TXT export          | pass | official renderer matrix tests                               |

## Upstream 制約

`milkdown-plugin-mdi@0.1.0` の editor support は front matter と inline MDI に限定される。blank paragraph、
indent / bottom、pagebreak、footnote 等の block authoring、commands、input rules、custom paste / clipboard は
upstream 未提供である。Illusions 側に grammar fallback は置かないため、公開 upstream release 後に package
更新と conformance test を行う。

## UI を残して延期した editor feature

- lint decoration / POS highlight
- search / speech highlight と auto-scroll
- selection tracking と選択範囲統計
- bubble / context menu / toolbar
- novel-specific paragraph / heading behavior

これらは UI の存在を「接続済み」と数えず、再実装時に feature ごとの integration test を要求する。

## 自動 release gate

`npm run check:boundaries` は通常の import boundary と editor architecture gate を連続実行する。後者は
retired path、core import、private MDI core import、package dependency graph、runtime version dedupe、公式
vertical CSS の ownership を検査する。

品質ゲートは次の全項目である。

- `npm run type-check`
- `npm run lint`
- `npm run check:boundaries`
- `npm run format:check`
- `npm run test:coverage`
- `npm run build:electron-renderer`
- `npm run bundle:electron`
