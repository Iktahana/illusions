# MDI 空白段落の扱い 再実装プラン (Issue #1471 / 親 #1464 / 元 PR #1425)

**Date**: 2026-05-23
**Owner**: Iktahana
**Branch**: `feature/mdi-blank-paragraph` → PR target: `dev`
**Worktree**: `../illusions-work-mdi-blank/`

---

## Goal

PR #1425 で導入されていた「意図的な空白段落」(`[[blank]]` マーカー方式) の保存・読込・解析・export を v1.2.3 ベース (= 現 v1.2.7 ロールバック後) に最小差分で再実装する。元 PR の挙動・テストを再現したうえで、ラウンドトリップ regression test を追加する。

## Non-Goals (重要)

PR #1425 由来の他のスコープ (SearchDialog Portal / ターミナル番号付け / .txt undefined ガード / VFS 再起動 / ignored-corrections mkdir / Dict 系) は本プランでは扱わない。これらは別 sub-issue (#1472–#1476) で個別に再実装する。

P0 regression #1457 (エディタクリック → 先頭スクロール、編集不能) と P1 #1445 (window blur/focus → スクロールジャンプ) は SearchDialog / `useWindowActivityState` / file watcher 起因であり、本プランの対象ファイルとは無関係。本プランでは以下のファイルに**一切**触らない：

- `components/editor/MilkdownEditor.tsx`
- `components/Editor.tsx`
- `components/EditorLayout.tsx`
- `lib/editor-page/use-window-activity.ts`
- `lib/editor-page/use-file-watch-integration.ts`
- `lib/editor-page/power-optimization.ts`
- `lib/dockview/use-dockview-adapter.ts`
- `lib/tab-manager/use-tab-state.ts`
- `components/SearchDialog.tsx`

## Architecture

```
保存パス:
  Editor ProseMirror → milkdown serializer → markdown 文字列
    → sanitizeMdiContent (Step 1a: 単独 <br /> 行 → [[blank]]; Step 1b: inline <br> → \n)
    → ファイルへ書き込み

読込パス:
  ファイル → markdown 文字列
    → remark-parse → mdast Root (paragraph[text=[[blank]]])
    → remarkMdiBlankPlugin (text="[[blank]]" のみの段落 → children=[])
    → milkdown parser → ProseMirror paragraph (空)

解析消費者 (NLP/統計/diff/readability):
  raw .mdi → stripMdiBlankMarkers() → 既存処理

エクスポート消費者:
  raw .mdi → 各 exporter 固有の [[blank]] 処理:
    txt:  [[blank]]\n → SCENE_BREAK_MARKER → 強制空行
    html: [[blank]] → PUA sentinel → <p></p>
    docx: [[blank]] → 空 Paragraph (spacing 120 after)
```

### 命名規約

| 識別子                  | 種別           | 場所                                                |
| ----------------------- | -------------- | --------------------------------------------------- |
| `MDI_BLANK_RE`          | 定数 (RegExp)  | `lib/export/mdi-parser.ts`                          |
| `stripMdiBlankMarkers`  | 関数           | 同上                                                |
| `remarkMdiBlankPlugin`  | unified Plugin | `packages/milkdown-plugin-japanese-novel/syntax.ts` |
| `japaneseNovelMdiBlank` | $remark 識別子 | `packages/milkdown-plugin-japanese-novel/index.ts`  |

### Feature flag

既存の `enableMdiBreak` フラグを流用する (PR #1425 と同じ判断)。理由: blank 段落は MDI 拡張記法であり、`[[br]]` と同じく MDI モード全体の有効化に追従させるのが自然。`config.ts` に新フラグは追加しない。

---

## Tech Stack

- TypeScript (strict), Vitest
- unified / remark / mdast (既存)
- markdown-it (既存、html exporter)
- docx (既存、docx exporter)
- Milkdown $remark (既存)

---

## Task Order (TDD)

各 task は別 commit。本 PR は task 単位の commit を 1 つの feature branch に積み、1 PR で `dev` へマージする。

### Task 1: ワークツリー作成と feature ブランチ準備

- [ ] `dev` を最新化: `git fetch origin dev`
- [ ] ワークツリー作成: `git worktree add -b feature/mdi-blank-paragraph ../illusions-work-mdi-blank origin/dev`
- [ ] `cd ../illusions-work-mdi-blank && npm install`
- [ ] サニティ確認: `npm run type-check && npm run test -- --run packages/milkdown-plugin-japanese-novel/__tests__/mdibreak.test.ts`
- **期待出力**: type-check pass、既存 `mdibreak.test.ts` の 7 cases 全部 green

### Task 2: `stripMdiBlankMarkers` + `MDI_BLANK_RE` (parser コア)

**先にテストを書く** (TDD):

- [ ] `lib/export/__tests__/mdi-parser-blank.test.ts` を新規作成:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { stripMdiBlankMarkers, MDI_BLANK_RE } from "@/lib/export/mdi-parser";

  describe("stripMdiBlankMarkers", () => {
    it("単独 [[blank]] 行を空文字に変換", () => {
      expect(stripMdiBlankMarkers("[[blank]]")).toBe("");
    });
    it("段落間の [[blank]] を空文字に変換し、周囲の改行は維持", () => {
      const input = "A段落\n\n[[blank]]\n\nB段落";
      expect(stripMdiBlankMarkers(input)).toBe("A段落\n\n\n\nB段落");
    });
    it("CRLF: [[blank]]\\r\\n の \\r まで吸収して空文字 + \\n を残す", () => {
      expect(stripMdiBlankMarkers("[[blank]]\r\n")).toBe("\n");
    });
    it("行内の [[blank]] は変換しない", () => {
      expect(stripMdiBlankMarkers("foo [[blank]] bar")).toBe("foo [[blank]] bar");
    });
    it("MDI_BLANK_RE は global + multiline フラグを持つ", () => {
      expect(MDI_BLANK_RE.flags).toBe("gm");
    });
  });
  ```

- [ ] テスト実行 → 全 fail (関数未実装)
- [ ] `lib/export/mdi-parser.ts` の `MDI_BREAK_RE` 定義直下に追加:

  ```typescript
  /** MDI blank paragraph marker (internal representation, written by sanitizeMdiContent) */
  export const MDI_BLANK_RE = /^\[\[blank\]\][ \t]*\r?$/gm;

  /**
   * Strip [[blank]] markers for plain-text analysis consumers (NLP, word count, etc.).
   * Replaces the marker line with empty string; surrounding blank lines remain.
   * CRLF note: on CRLF files a preceding \r is absorbed; normalize line endings before passing if required.
   */
  export function stripMdiBlankMarkers(content: string): string {
    return content.replace(MDI_BLANK_RE, "");
  }
  ```

- [ ] テスト再実行 → 5/5 pass
- **期待出力**: `npm run test -- --run lib/export/__tests__/mdi-parser-blank.test.ts` で 5 cases green

### Task 3: `sanitizeMdiContent` の Step 1a 追加 (保存パス, .mdi 限定)

> **重要 (Codex R1 + R9)**: `sanitizeMdiContent` は以下の **6 箇所**から file type に関係なく呼ばれる:
>
> 1. `lib/tab-manager/use-file-io.ts:242,266,293,355,370`
> 2. `lib/tab-manager/use-auto-save.ts:91,100,124`
> 3. `lib/tab-manager/use-close-dialog.ts:85`
> 4. `lib/tab-manager/use-electron-menu-bindings.ts:129`
> 5. **`app/page.tsx:1090`** (履歴復元時の `isClean` 判定; Codex R9 で発見)
>
> Step 1a (`<br />` → `[[blank]]`) を素朴に追加すると `.md` ファイルの `<br />` も書き換えてしまい、spec の "`.mdi` モードのみ有効" 宣言と矛盾する。さらに `app/page.tsx:1090` を取りこぼすと履歴復元時に `restoredContent` と `lastSaved` の正規化結果が file type で食い違い、`.mdi` タブが意図せず dirty / clean 判定を誤る。そのため Step 1a は **明示的に file type で gate** し、**全 6 箇所**を一斉に更新する。

#### 3a. シグネチャ変更

- [ ] `lib/tab-manager/types.ts` の `sanitizeMdiContent` のシグネチャを変更:

  ```typescript
  export function sanitizeMdiContent(
    content: string,
    options?: { fileType?: SupportedFileExtension },
  ): string {
  ```

  > Step 1a (`[[blank]]` 変換) は `options?.fileType === ".mdi"` のときのみ実行。Step 1b/2/3 は従来通り全 file type に適用 (これらは元から `.md` でも安全な処理)。

- [ ] `lib/tab-manager/types.ts` の関数本体を以下に変更:
  ```typescript
  export function sanitizeMdiContent(
    content: string,
    options?: { fileType?: SupportedFileExtension },
  ): string {
    let result = content;
    // Step 1a (MDI only): standalone <br /> on its own line → [[blank]] marker
    // CRLF-safe: allows optional \r before end-of-line
    // Note: user-authored standalone <br /> in .mdi is treated as blank paragraph
    //   (known limitation; same class as other bracket macros)
    if (options?.fileType === ".mdi") {
      result = result.replace(/^<br\s*\/?>[ \t]*\r?$/gm, "[[blank]]");
    }
    // Step 1b: remaining inline <br> tags → newline
    result = result.replace(/<br\s*\/?>/gi, "\n");
    // ... (Step 2/3 既存のまま)
  ```

#### 3b. 6 つの caller を更新 (Codex R9 で 1 件追加、Codex R12 で正しい field を確定)

> **fileType の取得元 (Codex R12)**: `EditorTabState` (`lib/tab-manager/tab-types.ts:30`) は `fileType: SupportedFileExtension` を **直接フィールドとして持つ** (required)。`MdiFileDescriptor` には `fileType` フィールドはない (`lib/project/mdi-file.ts:6-13`)。したがって全 caller で `tab.fileType` / `currentTab.fileType` を使う。`isEditorTab(tab)` で narrow した後にアクセスする。

- [ ] `lib/tab-manager/use-file-io.ts:242,266,293,355,370`: `sanitizeMdiContent(tab.content)` → `sanitizeMdiContent(tab.content, { fileType: tab.fileType })` (`tab` は既に `EditorTabState`)
- [ ] `lib/tab-manager/use-auto-save.ts:91,100,124`: 同上 (`tab.fileType` / `t.fileType`)
- [ ] `lib/tab-manager/use-close-dialog.ts:85`: 同上 (`tab.fileType`)
- [ ] `lib/tab-manager/use-electron-menu-bindings.ts:129`: 同上 (`tab.fileType`)
- [ ] **`app/page.tsx:1090`** (履歴復元 isClean 判定): `sanitizeMdiContent(restoredContent) === sanitizeMdiContent(lastSaved)` → 既存の `isEditorTab(currentTab)` ガード (line 1088-1089) のスコープ内で両 call に `{ fileType: currentTab.fileType }` を渡す
- [ ] **fallback 不要 (Codex R12)**: `EditorTabState.fileType` は required なので `?? ".mdi"` 等のフォールバックは書かない。type system が unsafe access を防いでくれる
- [ ] 履歴復元 regression test を `app/__tests__/` または `lib/storage/__tests__/` に追加し、`.mdi` タブと `.md` タブの両方で `isClean` が正しく決まることを assert

#### 3c. テスト

- [ ] `lib/tab-manager/__tests__/types-sanitize-blank.test.ts` を新規作成 (元 PR #1425 の `264e1a4e` 由来 + Codex R1 対応):

  ```typescript
  import { describe, it, expect } from "vitest";
  import { sanitizeMdiContent } from "@/lib/tab-manager/types";

  const MDI = { fileType: ".mdi" as const };
  const MD = { fileType: ".md" as const };

  describe("sanitizeMdiContent — blank paragraph conversion (.mdi only)", () => {
    it("(.mdi) standalone <br /> → [[blank]]", () => {
      expect(sanitizeMdiContent("<br />", MDI)).toBe("[[blank]]");
    });
    it("(.mdi) standalone <br/> → [[blank]]", () => {
      expect(sanitizeMdiContent("<br/>", MDI)).toBe("[[blank]]");
    });
    it("(.mdi) standalone <br> (no slash) → [[blank]]", () => {
      // The regex /^<br\s*\/?>[ \t]*\r?$/gm matches <br>, <br/>, <br />.
      expect(sanitizeMdiContent("<br>", MDI)).toBe("[[blank]]");
    });
    it("(.mdi) standalone <BR /> uppercase → newline (Step 1a is case-sensitive)", () => {
      expect(sanitizeMdiContent("<BR />", MDI)).toBe("\n");
    });
    it("(.mdi) <br /> with CRLF → [[blank]] + LF", () => {
      expect(sanitizeMdiContent("<br />\r\n", MDI)).toBe("[[blank]]\n");
    });
    it("(.mdi) <br> inside text → newline", () => {
      expect(sanitizeMdiContent("Hello<br>World", MDI)).toBe("Hello\nWorld");
    });
    it("(.mdi) blank paragraph in context", () => {
      const input = "A段落\n\n<br />\n\nB段落";
      expect(sanitizeMdiContent(input, MDI)).toBe("A段落\n\n[[blank]]\n\nB段落");
    });
    it("(.md) standalone <br /> → newline, NOT [[blank]]", () => {
      expect(sanitizeMdiContent("<br />", MD)).toBe("\n");
    });
    it("(.md) blank paragraph in context → no [[blank]] marker", () => {
      const input = "A段落\n\n<br />\n\nB段落";
      const out = sanitizeMdiContent(input, MD);
      expect(out).not.toContain("[[blank]]");
      expect(out).toBe("A段落\n\n\n\n\nB段落");
    });
    it("(no options) defaults to .md behavior (Step 1a off) — back-compat for callers that haven't migrated", () => {
      // This guards against forgetting to pass fileType in a new call site.
      expect(sanitizeMdiContent("<br />")).toBe("\n");
    });
  });
  ```

- [ ] テスト実行 → 全部 fail (Step 1a なし)
- [ ] 関数本体を 3a の通り実装
- [ ] テスト再実行 → 10/10 pass
- **期待出力**: 10 cases green、既存 `sanitizeMdiContent` 関連の他テストが回帰しない、`.md` ファイル保存で `<br />` が書き換えられない

### Task 4: `remarkMdiBlankPlugin` (読込パス)

- [ ] `packages/milkdown-plugin-japanese-novel/__tests__/paragraph-blank.test.ts` を新規作成 (元 PR `264e1a4e` 由来):

  ```typescript
  import { describe, it, expect } from "vitest";
  import { remarkMdiBlankPlugin } from "../syntax";

  type TextNode = { type: "text"; value: string };
  type Paragraph = { type: "paragraph"; children: TextNode[] };
  type Root = { type: "root"; children: Paragraph[] };

  function makeTree(paragraphText: string): Root {
    return {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: paragraphText }] }],
    };
  }
  function runPlugin(tree: Root, options?: { enable?: boolean }): Root {
    const factory = remarkMdiBlankPlugin as unknown as (opts?: {
      enable?: boolean;
    }) => (t: Root) => void;
    factory(options)(tree);
    return tree;
  }

  describe("remarkMdiBlankPlugin", () => {
    it("[[blank]]-only paragraph → children becomes []", () => {
      const tree = runPlugin(makeTree("[[blank]]"));
      expect(tree.children[0]!.children).toHaveLength(0);
    });
    it("normal text paragraph → unchanged", () => {
      const tree = runPlugin(makeTree("春は曙。"));
      expect(tree.children[0]!.children).toHaveLength(1);
      expect(tree.children[0]!.children[0]).toEqual({ type: "text", value: "春は曙。" });
    });
    it("[[blank]] with surrounding text → unchanged (mixed content)", () => {
      const tree = runPlugin(makeTree("before [[blank]] after"));
      expect(tree.children[0]!.children).toHaveLength(1);
    });
    it("disabled via { enable: false } → unchanged", () => {
      const tree = runPlugin(makeTree("[[blank]]"), { enable: false });
      expect(tree.children[0]!.children).toHaveLength(1);
    });
  });
  ```

- [ ] テスト実行 → import error (関数未定義)
- [ ] `packages/milkdown-plugin-japanese-novel/syntax.ts` の末尾に追加:
  ```typescript
  export const remarkMdiBlankPlugin: Plugin<[{ enable?: boolean } | undefined], Root> = (opts) => {
    const enable = opts?.enable !== false;
    return (tree) => {
      if (!enable) return;
      visit(tree, "paragraph", (node: Paragraph) => {
        if (
          node.children.length === 1 &&
          node.children[0].type === "text" &&
          (node.children[0] as Text).value.trim() === "[[blank]]"
        ) {
          node.children.length = 0;
        }
      });
    };
  };
  ```
- [ ] import 行に `Paragraph, Text` を追加: `import type { Paragraph, Root, Text } from "mdast";`
- [ ] テスト再実行 → 4/4 pass
- **期待出力**: 4 cases green

### Task 5: Milkdown へのプラグイン登録

- [ ] `packages/milkdown-plugin-japanese-novel/index.ts` の import に `remarkMdiBlankPlugin` を追加
- [ ] `remarkMdiBreak` 定義直下に `remarkMdiBlank` を追加:
  ```typescript
  const remarkMdiBlank = $remark(
    "japaneseNovelMdiBlank",
    () => remarkMdiBlankPlugin as (o?: { enable?: boolean }) => (tree: unknown) => void,
    { enable: enableMdiBreak },
  );
  ```
- [ ] `plugins` 配列の該当行を変更:
  ```typescript
  ...(enableMdiBreak ? [remarkMdiBreak, remarkMdiBlank, mdibreakSchema] : []),
  ```
- [ ] `npm run type-check` で型チェック
- **期待出力**: type-check pass、既存 milkdown プラグインの動作に影響なし

### Task 6: 解析消費者 (NLP / 統計 / diff / readability) で `stripMdiBlankMarkers` を適用

5 ファイルを個別に編集する (順不同):

- [ ] `components/Characters.tsx`: import 追加 + line 148: `tokenizeParagraph(stripMdiBlankMarkers(content))`
- [ ] `components/WordFrequency.tsx`: import 追加 + line 172: `analyzeWordFrequency(stripMdiBlankMarkers(content))`
- [ ] `lib/editor-page/text-statistics.ts`: import 追加 + `extractVisibleText` の冒頭で `let text = stripMdiBlankMarkers(rawContent);`
- [ ] `lib/services/diff-service.ts`: import 追加 + `stripHtmlForDiff` を `return stripMdiBlankMarkers(text).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");`
- [ ] `lib/utils/readability.ts`: import 追加 + `cleanMarkdown` の chain 先頭で `stripMdiBlankMarkers(markdown)`

import 例 (全 5 ファイル共通):

```typescript
import { stripMdiBlankMarkers } from "@/lib/export/mdi-parser";
```

- [ ] `npm run type-check` で確認
- [ ] 既存ユニットテスト全部緑のまま (`npm run test -- --run lib/editor-page lib/utils lib/services components`)
- **期待出力**: 既存テスト regression なし

### Task 7: エクスポート消費者 (txt / html / docx)

#### 7a. txt-exporter (`lib/export/txt-exporter.ts`)

- [ ] line 11 付近に定数追加: `const BLANK_PARA_RE = /^\[\[blank\]\]$/;`
- [ ] `stripMarkdown` 内、heading 検出 (`processed.replace(/^#{1,6}\s+/, "")`) の直前に追加:
  ```typescript
  // [[blank]] paragraph marker → forced blank line
  if (BLANK_PARA_RE.test(processed.trim())) {
    result.push(SCENE_BREAK_MARKER);
    continue;
  }
  ```

#### 7b. mdi-to-html (`lib/export/mdi-to-html.ts`)

- [ ] import に `MDI_BLANK_RE` を追加
- [ ] `mdiToHtml` 関数の `const md = createMarkdownIt();` 直後を以下に変更:
  ```typescript
  // Pre-process: replace [[blank]] paragraph markers with a PUA sentinel that
  // markdown-it will wrap in <p>…</p>, then swap the sentinel out for empty <p>.
  // U+E000 (Private Use Area) is used so the sentinel never collides with real content.
  const BLANK_SENTINEL = "";
  const preprocessed = markdown.replace(new RegExp(MDI_BLANK_RE.source, "gm"), BLANK_SENTINEL);
  const rawHtml = md.render(preprocessed);
  const bodyHtml = rawHtml.replace(new RegExp(`<p>${BLANK_SENTINEL}\\s*</p>`, "g"), "<p></p>");
  ```
  > **重要**: 元 PR の `BLANK_SENTINEL = ""` は git diff 上で不可視文字 (PUA) を表示できなかっただけで、実体は U+E000 と推定。明示的に `` と書く方が安全かつ読みやすい。

#### 7c. docx-exporter (`lib/export/docx-exporter.ts`)

- [ ] `parseMarkdownToDocxParagraphs` (line 185) 内、heading 検出ブロックの**直前**に追加:
  ```typescript
  // [[blank]] marker → empty DOCX paragraph
  if (/^\[\[blank\]\]$/.test(trimmed)) {
    flushParagraph();
    paragraphs.push(new Paragraph({ spacing: { before: 0, after: 120 } }));
    continue;
  }
  ```

#### テスト (Codex R3 対応: html / txt / docx 三本立て)

- [ ] `lib/export/__tests__/blank-paragraph-export.test.ts` を新規作成:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { mdiToHtml } from "@/lib/export/mdi-to-html";
  // 注: txt/docx の public 関数名は実装時に確認 (mdiToTxt? convertToTxt?)
  // docx (Codex R11 採用): generateDocxBlob() の出力 Blob を fflate で unzip し、
  //   word/document.xml をパースして空 Paragraph (`<w:p>` で text run なし) を assert する。
  //   既存 `lib/export/__tests__/export-web.test.ts:66` も同じパターンを使っている。
  //   `parseMarkdownToDocxParagraphs` を test 用に export することはしない (production 露出を避ける)。

  describe("html exporter — [[blank]] paragraph handling", () => {
    it("[[blank]] → <p></p>", () => {
      const html = mdiToHtml("A\n\n[[blank]]\n\nB", { bodyOnly: true });
      expect(html).toContain("<p></p>");
      expect(html).not.toContain("[[blank]]");
      // U+E000 sentinel must not leak
      expect(html).not.toContain("");
    });
    it("連続 [[blank]] → 2 連続の <p></p>", () => {
      const html = mdiToHtml("A\n\n[[blank]]\n\n[[blank]]\n\nB", { bodyOnly: true });
      const count = (html.match(/<p><\/p>/g) ?? []).length;
      expect(count).toBe(2);
    });
  });

  describe("txt exporter — [[blank]] paragraph handling", () => {
    it("[[blank]] → 強制空行 (SCENE_BREAK_MARKER 経由)", () => {
      // 実コードの export 関数名を確認して呼ぶ。
      // assert: 出力に "[[blank]]" を含まない、かつ A段落 と B段落 の間に空行 1 行以上存在。
    });
  });

  describe("docx exporter — [[blank]] paragraph handling", () => {
    it("[[blank]] → 空 <w:p> (空 Paragraph) が DOCX に含まれる", async () => {
      // generateDocxBlob() を呼び、戻り値の Blob を fflate で unzip。
      // word/document.xml に <w:p>(text run なし)</w:p> パターンが存在することを assert。
      // 既存 export-web.test.ts:66 の inflate / parseXml ヘルパを参考に。
    });
  });
  ```

  > **実装上の注意 (Codex R11 採用)**: 各 exporter の public 関数名は task 着手時に実コードで確認する。
  > docx は `lib/export/docx-exporter.ts:175` の public `generateDocxBlob()` を呼び、fflate (既に `package.json:54` で deps 済) で word/document.xml を unzip → XML パースして空 `<w:p>` を assert する。既存 `lib/export/__tests__/export-web.test.ts:66` が同パターンを使っているので参考にする。
  > **`parseMarkdownToDocxParagraphs` を production code から export することはしない** (test 用露出は API surface を不必要に広げるため避ける)。

- [ ] 3 describe ブロック全部 pass を確認 (Codex R3: html / txt / docx すべてで blank が個別検証される)
- **期待出力**: 3 テストファイル green。txt/docx の新ブランチがそれぞれ exporter unit test で網羅される

### Task 8: save / load 合成テスト (Issue #1471 「ラウンドトリップ」要件)

> **重要 (Codex R2)**: 元案の「remark-stringify で `[[blank]]` に戻る」期待は **誤り**。
> `packages/milkdown-plugin-japanese-novel/nodes/paragraph.ts:43-49` の `toMarkdown` runner は空段落に対して `[[blank]]` を emit しない (普通の paragraph として open/close するだけ)。
> ProseMirror の空段落 → markdown stringify は CommonMark の制約で blank line に collapse される。
>
> 本プランで保証する round-trip は次の 2 方向の合成:
>
> 1. **Save**: `<br />` (paste / import 由来) → `sanitizeMdiContent` → `[[blank]]` (Task 3 で test 済み)
> 2. **Load**: `[[blank]]` (file) → remark-parse + `remarkMdiBlankPlugin` → 空 mdast paragraph (Task 4 で test 済み)
>
> Task 8 はこの 2 方向を**直列に結合**したテストで、stringify 期待は外す。

- [ ] `packages/milkdown-plugin-japanese-novel/__tests__/paragraph-blank-roundtrip.test.ts` を新規作成:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { unified } from "unified";
  import remarkParse from "remark-parse";
  import { sanitizeMdiContent } from "@/lib/tab-manager/types";
  import { remarkMdiBlankPlugin } from "@/packages/milkdown-plugin-japanese-novel/syntax";

  function saveThenLoad(raw: string) {
    const sanitized = sanitizeMdiContent(raw, { fileType: ".mdi" });
    const tree = unified().use(remarkParse).parse(sanitized);
    // remarkMdiBlankPlugin returns a transformer; invoke it manually
    const runner = (
      remarkMdiBlankPlugin as unknown as (opts?: { enable?: boolean }) => (t: unknown) => void
    )({ enable: true });
    runner(tree);
    return { sanitized, tree };
  }

  describe("MDI blank paragraph — save → load合成 round-trip", () => {
    it("paste-origin <br /> → 保存形 [[blank]] → load で空 paragraph", () => {
      const { sanitized, tree } = saveThenLoad("A段落\n\n<br />\n\nB段落");
      expect(sanitized).toBe("A段落\n\n[[blank]]\n\nB段落");
      const root = tree as { children: { type: string; children: unknown[] }[] };
      const middle = root.children[1];
      expect(middle.type).toBe("paragraph");
      expect(middle.children).toHaveLength(0);
    });

    it("連続 <br /> → 連続 [[blank]] → 2 連続の空 paragraph", () => {
      const { sanitized, tree } = saveThenLoad("A\n\n<br />\n\n<br />\n\nB");
      expect(sanitized).toBe("A\n\n[[blank]]\n\n[[blank]]\n\nB");
      const root = tree as { children: { type: string; children: unknown[] }[] };
      const emptyParagraphs = root.children.filter(
        (n) => n.type === "paragraph" && n.children.length === 0,
      );
      expect(emptyParagraphs.length).toBe(2);
    });

    it("先頭空段落 → 保持される", () => {
      const { sanitized, tree } = saveThenLoad("<br />\n\nA");
      expect(sanitized).toBe("[[blank]]\n\nA");
      const root = tree as { children: { type: string; children: unknown[] }[] };
      expect(root.children[0].type).toBe("paragraph");
      expect(root.children[0].children).toHaveLength(0);
    });

    it("(known limitation) ネイティブ Enter 空段落の save direction は collapse される", () => {
      // ProseMirror の空段落は serializer が \n\n に折り畳むため、保存ファイルには
      // [[blank]] が現れない。[[blank]] の生成元は paste / import / 外部書き込みのみ。
      // この制約は docs/MDI/spec.md にも明記する (Task 9)。
      expect(true).toBe(true);
    });
  });
  ```

- [ ] テスト pass を確認
- **期待出力**: 4 cases green。保存経路 + 読込経路が結合して正しく動くことが test で示される

### Task 9: docs/MDI/spec.md 更新

- [ ] §6.2 (改行のセマンティクス) 末尾に「意図的な空白段落」サブセクションを追加 (元 PR `87bba69b` 由来 + Codex R4 対応):

  ```markdown
  #### 意図的な空白段落（内部表現: `[[blank]]`）

  外部 HTML や Word から貼り付けた / 取り込んだ単独 `<br />` 行は、`.mdi` ファイルへ
  保存される際に `[[blank]]` マーカーへ変換される。
  ```

  春は曙。

  [[blank]]

  夏は夜。

  `````

  - 内部表現であり、ユーザーが直接入力するマーカーではない
  - **`.mdi` モードのみ有効**（`.md` ファイルでは Step 1a を無効化し `<br />` は単純に改行へ変換される）
  - 生成元は **paste / import / 外部書き込み のみ**。ProseMirror エディタでの Enter 連打で作った空段落は CommonMark serializer により blank line へ collapse されるため `[[blank]]` は emit されない（Issue #1471 受け入れ条件 "ラウンドトリップ" の **load 方向** はこれにより満たされる）
  - エクスポート時: TXT → 空行、HTML → `<p></p>`、DOCX → 空段落
  - ユーザーが `[[blank]]` をリテラル文字列として入力した場合は空白段落として解釈される（bracket macro 全般の既知 escape 制限と同様）
  - **既知の限界 (Codex R4)**: fenced code block (```` ``` ````) 内や引用ブロック内の単独 `[[blank]]` も exporter (txt/html/docx) では空段落に変換される。これは既存 `[[br]]` の exporter ハンドリングと同じクラスの制約 (§6.1 の `[[br]]` 注記参照)
  `````

- [ ] §6.3 Editor UX Rules テーブルに行を追加:
  ```
  | `[[blank]]` 保存 | 意図的な空白段落               | `[[blank]]`   | `paragraph`（空）  |
  ```

### Task 10: 統合検証

- [ ] 全テストスイート: `npm run test -- --run`
- [ ] 型チェック: `npm run type-check`
- [ ] lint: `npm run lint`
- [ ] **diff 監査 (Codex R1/R8 対応)**: `git diff origin/dev --name-only` を実行し、no-touch list (Non-Goals セクション) に挙げたファイルが diff に含まれないことを目視確認
- [ ] **手動検証** (Electron dev):
  1. `npm run electron:dev`
  2. 新規 .mdi ファイルを作成
  3. `春は曙。<Enter><Enter><Enter><Enter>夏は夜。` と入力 (中央に空段落を 2 個作る)
  4. 保存 → ファイルを VS Code 等で開く。**現時点では `[[blank]]` は書き出されない**（serializer 制約; 本 PR スコープ外）。空段落部分が `\n\n` の繰り返しになっていれば OK
  5. 外部 HTML / Word からの paste で `<br />` が含まれる入力を作成し保存 → ファイル中に `[[blank]]` が 1 行で書き込まれていることを確認
  6. その `[[blank]]` 入りファイルを再オープン → 空段落として表示される
  7. `File > Export > txt / html / docx` を実行し、各形式で空段落が保持されていることを確認
  8. **.md ファイル regression (Codex R1)**: 新規 `.md` ファイルで `<br />` を含むテキストを保存 → ファイル中に `[[blank]]` が**現れない**ことを確認 (`<br />` が `\n` に変換されているだけ)
  9. **#1457 / #1445 regression チェック**:
     - エディタをクリックしても先頭にジャンプしない
     - ウィンドウフォーカス切替後にカーソル位置が維持される
     - 横書き ↔ 縦書きの toggle が動作する
- **期待出力**: すべての検証 pass

### Task 11: PR 作成

- [ ] `git push -u origin feature/mdi-blank-paragraph`
- [ ] `gh pr create --base dev --title "fix(mdi): re-implement [[blank]] paragraph marker (re #1471)"` で PR を開く
- [ ] PR 本文に以下を含める:
  - 元 PR #1425 から切り出した範囲
  - 親 Issue `#1464` と sub-issue `#1471` を `Closes #1471` で参照 (#1464 は他 sub-issue で個別に閉じる)
  - 受け入れ条件 (4 項目) のチェックリスト
  - 手動検証結果のスクリーンショット (任意)

---

## Risks & Mitigations

| Risk                                                                                                    | 対策                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 既存の `[[br]]` プラグインと競合 visit が走り、順序依存バグが出る                                       | `index.ts` で `[remarkMdiBreak, remarkMdiBlank, mdibreakSchema]` の順に明示登録。`remarkMdiBlank` は `text` ノードではなく `paragraph` ノードを visit するため、`[[br]]` の splitting と非競合                                                                                                                                                                                                    |
| `BLANK_SENTINEL` の PUA 文字 (U+E000) が他処理を誤動作させる、または real content と衝突する (Codex R7) | (1) HTML エクスポータ関数スコープ内のみで使用し、`bodyHtml` 生成と同じ式で 1:1 に剥がす。(2) U+E000 は CSS / HTML パイプライン双方で意味を持たず、エディタの自然な日本語入力に現れる可能性は極めて低い (Markdown / markdown-it のデフォルト `html: false` のままで XSS リスクなし)。(3) html 出力にセンチネルが残っていないことを Task 7 のテストで検証 (`expect(html).not.toContain("\\uE000")`) |
| `sanitizeMdiContent` の Step 1a が `.md` ファイルでも `[[blank]]` を挿入する (Codex R1)                 | Step 1a を `options.fileType === ".mdi"` で gate。6 caller (`use-file-io`, `use-auto-save`, `use-close-dialog`, `use-electron-menu-bindings`, **`app/page.tsx:1090`**) を全て更新 (Codex R9)。`.md` テストで **`[[blank]]` が混入しないこと** を検証 (Task 3c の 2 ケース)。`.md` でも Step 1b は引き続き有効なので `<br />` 自体は `\n` に正規化される — これは元の挙動と同じ (Codex R10)        |
| `<br>` / `<br/>` / `<br />` の表記揺れがある (Codex R6)                                                 | 採用 regex `^<br\s*\/?>[ \t]*\r?$/gm` は **lowercase `<br>` / `<br/>` / `<br />` すべて** にマッチする (`\s*\/?>` が `>`, `/>`, ` />` をカバー)。大文字版 `<BR />` は意図的に対象外 (Step 1b で改行に変換)。テストで 3 表記 + uppercase を網羅                                                                                                                                                    |
| 末尾空段落が保存時に消える (CommonMark serializer の trim)                                              | 既知の制限として `docs/MDI/spec.md` に記載。Issue では「末尾空段落を除く」を許容                                                                                                                                                                                                                                                                                                                  |
| #1457 / #1445 の P0 regression を再発させる                                                             | Non-Goals セクションで列挙したファイルに**一切**触らない。Task 11 直前に `git diff origin/dev --name-only` で no-touch list と照合                                                                                                                                                                                                                                                                |

## Acceptance Criteria (Issue #1471 から転記)

- [ ] v1.2.3 ベースから差分最小で実装
- [ ] regression test を追加（空白段落のラウンドトリップ）
- [ ] 既存の MDI ファイルが壊れないことを確認
- [ ] #1457 / #1445 の P0 regression を再発させない

---

## Out of scope (本 PR では実装しない)

- エディタ UI から空白段落を意図的に挿入するボタン / ショートカット
- 末尾空段落の保持 (CommonMark stringify の制約)
- `.md` モードでの `[[blank]]` サポート (Codex R1 を受け、`.mdi` 限定として明示的に gate)
- ProseMirror 空段落 → `[[blank]]` 自動 emit (paragraph node の `toMarkdown` runner 拡張は別 issue へ)
- fenced code block 内の `[[blank]]` を exporter で literal として扱う特殊処理 (Codex R4; 既存 `[[br]]` と同じ制約として spec 記載)

これらが必要になれば別 Issue として起票する。

---

## Review History

### Iteration 1 (Codex, 2026-05-23)

**Verdict**: NEEDS_REVISION → revisions applied

| ID  | Severity   | 対応               | 概要                                                                                                                                                                     |
| --- | ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | CRITICAL   | **ACCEPT**         | `sanitizeMdiContent` Step 1a を `options.fileType === ".mdi"` で gate。caller 全部更新 + `.md` 回帰テスト 2 ケース追加 (Task 3)                                          |
| R2  | CRITICAL   | **PARTIAL ACCEPT** | Task 8 から remark-stringify 期待を削除。save 経路 + load 経路の合成テストに変更。ネイティブ Enter 空段落の collapse は known limitation として Task 8 と spec.md に明記 |
| R3  | IMPORTANT  | **ACCEPT**         | Task 7 のテストを html / txt / docx の 3 describe ブロックに拡張                                                                                                         |
| R4  | IMPORTANT  | **PARTIAL ACCEPT** | block-aware 処理は YAGNI (元 PR にもない、`[[br]]` も同じ制約) のため実装しない。代わりに spec.md に既知の限界として明記                                                 |
| R5  | IMPORTANT  | **ACCEPT**         | `npm run typecheck` → `npm run type-check` を 4 箇所修正                                                                                                                 |
| R6  | SUGGESTION | **ACCEPT**         | regex 挙動と prose の食い違いを訂正。テストに `<br>` (no slash) ケースを追加 (Task 3c)                                                                                   |
| R7  | SUGGESTION | **PARTIAL ACCEPT** | "never collides" の言い切りを削除し、U+E000 を選んだ根拠と漏洩防止テストの 2 段重ねに変更 (Risk 表 + Task 7 テスト)                                                      |
| R8  | SUGGESTION | **ACCEPT**         | Non-Goals の no-touch list に `components/Editor.tsx` / `components/EditorLayout.tsx` / `lib/tab-manager/use-tab-state.ts` を追加                                        |

### Iteration 2 (Codex, 2026-05-23)

**Verdict**: NEEDS_REVISION → revisions applied

| ID  | Severity | 対応       | 概要                                                                                                                                                                                                                                                                          |
| --- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R9  | MEDIUM   | **ACCEPT** | 6 番目の caller `app/page.tsx:1090` (履歴復元 isClean) を見落とし。Task 3b に追加、Risk 表更新、復元 regression test を要求                                                                                                                                                   |
| R10 | LOW      | **ACCEPT** | `.md` で「`<br />` が保持される」表現を修正。実際は Step 1b により `<br />` → `\n` に正規化される (これが元の挙動と同じ)。Risk 表の wording を「`.md` でも `[[blank]]` が混入しないこと」に変更                                                                               |
| R11 | NIT      | **ACCEPT** | `parseMarkdownToDocxParagraphs` の test-only export 案を撤回。代わりに既に dependency である `fflate` で `generateDocxBlob()` の出力 DOCX を unzip → `word/document.xml` を XML パース → 空 `<w:p>` を assert。既存 `lib/export/__tests__/export-web.test.ts:66` の手法を流用 |

### Iteration 3 (Codex, 2026-05-23)

**Verdict**: NEEDS_REVISION → revisions applied → 最終承認待ち

| ID  | Severity  | 対応       | 概要                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R12 | IMPORTANT | **ACCEPT** | Task 3b の `tab.file?.fileType` / `currentTab.file?.fileType` 表記を訂正。実際は `EditorTabState.fileType` が required field として直接存在し (`lib/tab-manager/tab-types.ts:30`)、`MdiFileDescriptor` には fileType フィールドがない (`lib/project/mdi-file.ts:6-13`)。全 caller で `tab.fileType` / `currentTab.fileType` を使い、fallback (`?? ".mdi"`) は不要。`app/page.tsx:1090` は既存の `isEditorTab` ガード内で参照する |
