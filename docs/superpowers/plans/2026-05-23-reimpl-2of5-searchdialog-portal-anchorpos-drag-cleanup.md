# 再実装 (2/5): SearchDialog の React Portal + anchorPos + ドラッグクリーンアップ (#1472)

> 親 Issue: #1464 — 元 PR #1425 から SearchDialog 修正のみを切り出して再実装
> ロールバックリリース: v1.2.7 (commit `45bbb58` → `cd88c94` で dev/main が v1.2.3 ベースラインに整列)

## Goal

dockview パネル内に render されていた `SearchDialog` が、dockview の内部 CSS が適用する `transform: translate3d(0,0,0)` により `position: fixed` の containing block を破壊され、ViewDock 領域上に誤配置される問題を解消する。React Portal で `document.body` 直下に逃がし、エディタ領域基準で初期位置を計算し、ドラッグ中の `mousemove` ハンドラがダイアログ非表示後も発火するリークを止める。

副次的に、CMD+F 押下時に `editorViewInstance` が指す editor と dockview の `activeTabId` を一致させるための「アクティブパネル focus → setActive()」連携も含める（SearchDialog が anchor として参照する scrollContainerRef が、現在タイプ中のエディタ panel と確実に同じになることを保証する）。

## Architecture

```
[CMD+F]
   ↓
NovelEditor (components/Editor.tsx)
   ├─ scrollContainerRef → anchorRef として SearchDialog に渡す
   └─ <SearchDialog anchorRef={scrollContainerRef} ... />
                              ↓
                       createPortal(<dialog>, document.body)
                              ↓
                       [初期位置]
                       anchorRef.current.getBoundingClientRect() →
                       viewport クランプ →
                       { top, right } 配置
                              ↓
                       [ドラッグ]
                       mousedown → addEventListener(mousemove/mouseup)
                       mouseup   → removeEventListener
                       close     → isDragging.current = false
                                   + anchorPos/dragOffset reset
```

主要な不変条件:

1. `position: fixed` ダイアログは containing block を viewport にしなければならない → portal で `document.body` 直下に逃がす。
2. close 後の再 open では位置が現エディタレイアウトから再計算される → `isOpen` が false に遷移したら `anchorPos = null`, `dragOffset = null`。
3. ドラッグ中に dialog が unmount または close されても `mousemove` が state を更新しない → `isDragging.current = false` に落とし、ハンドラは early-return。

## Tech Stack

- React 19 + `createPortal` from `react-dom`
- 既存の Tailwind class 体系 (`z-[9999]` で dockview の `.dv-*` overlay より上に出る)
- vitest + jsdom (本リポジトリ慣例: `@testing-library/react` は導入しない。純関数 + react-dom/client の最低限の DOM 操作で regression test を書く)

## 受け入れ条件 (Issue #1472 より転記)

- [ ] v1.2.3 ベースから差分最小で実装
- [ ] regression test を追加（mount/unmount/ドラッグ後のリーク検出）
- [ ] 既存の検索動作（検索／置換／次へ／前へ）が壊れないこと
- [ ] #1457 / #1445 の P0 regression を再発させない

## 影響範囲（PR #1425 commit `3510b35` の `fix(search):` 部分の正確な再実装）

| ファイル                                                            | 変更内容                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `components/SearchDialog.tsx`                                       | `createPortal` 導入、`anchorRef` prop、`anchorPos` state、close 時のドラッグ/位置リセット、`z-50 → z-[9999]` |
| `components/Editor.tsx`                                             | `<SearchDialog>` に `anchorRef={scrollContainerRef}` を渡す（1 行追加）                                      |
| `components/EditorLayout.tsx`                                       | active panel wrapper に `onFocus={() => panelApi.setActive()}` を追加（3 行）                                |
| `lib/search-dialog/compute-anchor-pos.ts` _(新規)_                  | 位置計算の純関数抽出（unit-test 可能化のため）                                                               |
| `lib/search-dialog/__tests__/compute-anchor-pos.test.ts` _(新規)_   | 純関数 regression test                                                                                       |
| `components/__tests__/search-dialog-drag-cleanup.test.tsx` _(新規)_ | jsdom + react-dom/client でドラッグハンドラ unmount リーク検出                                               |

## Non-goals

- ターミナル PTY kill / .txt undefined / VFS 再起動 / MDI `[[blank]]` — それぞれ別 sub-issue (3/5, 4/5, 5/5 …) で扱う。
- CMD+P print の wiring — Issue #1472 の scope 外（元 PR #1425 の別 fix）。
- SearchDialog の z-index 全体方針（dockview 以外の overlay との優先度）— `z-[9999]` で dockview overlay 直上に出れば本 issue は満たされる。

---

## Task 1: 位置計算の純関数を抽出する

**Why first**: テスト可能性を確保し、後続タスクの SearchDialog 改修と test を並行レビューしやすくする。純関数化により viewport クランプ仕様（narrow viewport / off-screen anchor）が明示的に文書化される。

### Steps

1. [ ] `lib/search-dialog/compute-anchor-pos.ts` を新規作成:

   ```ts
   // 位置計算の純関数。SearchDialog から抽出して unit-test 可能にする。
   // dockview の transform が position:fixed の containing block を破壊するため、
   // ダイアログは document.body 直下に portal される。本関数は anchor 要素の
   // viewport 座標から、ダイアログを anchor の右上に置くための { top, right } を
   // 算出し、viewport からはみ出ないように左右をクランプする。

   export interface AnchorRect {
     readonly top: number;
     readonly right: number;
   }

   export interface AnchorPos {
     readonly top: number;
     readonly right: number;
   }

   /**
    * Compute the top-right anchor position for the dialog.
    *
    * @param rect anchor 要素の getBoundingClientRect() 由来の { top, right }
    * @param viewportWidth window.innerWidth
    * @param dialogWidth ダイアログ幅 (px)
    * @param padding ダイアログと viewport / anchor 右端の最小マージン (px)
    */
   export function computeAnchorPos(
     rect: AnchorRect,
     viewportWidth: number,
     dialogWidth: number,
     padding: number,
   ): AnchorPos {
     const rawRight = viewportWidth - rect.right + padding;
     const minRight = padding;
     const maxRight = Math.max(padding, viewportWidth - dialogWidth - padding);
     const clampedRight = Math.max(minRight, Math.min(maxRight, rawRight));
     return { top: rect.top + padding / 2, right: clampedRight };
   }
   ```

   - `rect.top + padding / 2` は元 PR の `rect.top + 8` (padding=16) と一致させる。
   - クランプ上限 `viewportWidth - dialogWidth - padding` が `padding` より小さくなる極端な viewport では `Math.max(padding, …)` で下限を優先する。`right` 位置指定なので dialog の右端は常に viewport 内に収まり、必要なら左端が viewport 外に出る（dialog が viewport より広い場合）。

### Verification

```bash
npx vitest run lib/search-dialog/__tests__/compute-anchor-pos.test.ts
```

期待: Task 2 のテストが PASS する（このタスク単独では実装のみ）。

---

## Task 2: `computeAnchorPos` の regression test を書く

**Why**: 位置計算が壊れたら CMD+F の UX が破壊される。コンポーネント描画なしでも完全に検証可能。

### Steps

1. [ ] `lib/search-dialog/__tests__/compute-anchor-pos.test.ts` を新規作成:

   ```ts
   import { describe, it, expect } from "vitest";
   import { computeAnchorPos } from "../compute-anchor-pos";

   const DIALOG_WIDTH = 320;
   const PADDING = 16;

   describe("computeAnchorPos", () => {
     it("places dialog at top-right of the anchor in a wide viewport", () => {
       // anchor: viewport 中央付近のエディタ panel (右端 1000px)
       const pos = computeAnchorPos({ top: 64, right: 1000 }, 1440, DIALOG_WIDTH, PADDING);
       // rawRight = 1440 - 1000 + 16 = 456
       expect(pos.right).toBe(456);
       expect(pos.top).toBe(72); // 64 + 16/2
     });

     it("clamps right when anchor extends past viewport right edge", () => {
       // anchor.right > viewportWidth (例: dockview がスクロール領域内にある)
       // rawRight が padding を下回るので minRight にクランプ
       const pos = computeAnchorPos({ top: 64, right: 1500 }, 1440, DIALOG_WIDTH, PADDING);
       expect(pos.right).toBeGreaterThanOrEqual(PADDING);
     });

     it("clamps right so dialog never overflows the viewport left edge", () => {
       // 狭い viewport で rawRight が大きすぎると dialog が左にはみ出す
       const pos = computeAnchorPos({ top: 64, right: 100 }, 500, DIALOG_WIDTH, PADDING);
       // maxRight = 500 - 320 - 16 = 164
       // rawRight = 500 - 100 + 16 = 416 → 164 にクランプ
       expect(pos.right).toBe(164);
     });

     it("falls back to padding when viewport is too narrow for the dialog", () => {
       // dialog が viewport より広い ⇒ maxRight が padding を下回る
       const pos = computeAnchorPos({ top: 0, right: 50 }, 200, DIALOG_WIDTH, PADDING);
       expect(pos.right).toBe(PADDING);
     });

     it("returns top with padding/2 offset from the anchor top", () => {
       const pos = computeAnchorPos({ top: 0, right: 800 }, 1000, DIALOG_WIDTH, PADDING);
       expect(pos.top).toBe(8);
     });
   });
   ```

### Verification

```bash
npx vitest run lib/search-dialog/__tests__/compute-anchor-pos.test.ts
```

期待: 5 つすべて PASS。

---

## Task 3: `SearchDialog` を Portal + anchorPos + drag cleanup に書き換える

**Why**: 本 issue の中核修正。

### Steps

1. [ ] `components/SearchDialog.tsx` を編集:

   ```diff
   "use client";

   import React, { useEffect, useRef, useState, useCallback } from "react";
   +import { createPortal } from "react-dom";
   import { Search, X, ChevronUp, ChevronDown, List } from "lucide-react";
   import { EditorView, Decoration } from "@milkdown/prose/view";
   import { TextSelection } from "@milkdown/prose/state";
   import { centerEditorPosition } from "@/lib/editor-page/center-editor-position";
   +import { computeAnchorPos } from "@/lib/search-dialog/compute-anchor-pos";

   +const DIALOG_WIDTH = 320; // w-80 と一致させる
   +const DIALOG_PADDING = 16; // 8px top offset / 16px right offset の元値と整合

   interface SearchDialogProps {
     editorView: EditorView | null;
     isOpen: boolean;
     onClose: () => void;
     onShowAllResults?: (matches: SearchMatch[], searchTerm: string) => void;
     initialSearchTerm?: string;
   +  /** エディタ領域の ref。ダイアログ初期位置計算に使用する。
   +   *  dockview の CSS transform が position:fixed の containing block を破壊するため、
   +   *  portal + getBoundingClientRect() でエディタ基準の座標を求める。 */
   +  anchorRef?: React.RefObject<HTMLElement | null>;
   }
   ```

2. [ ] state と effect を追加:

   ```diff
     export default function SearchDialog({
       editorView,
       isOpen,
       onClose,
       onShowAllResults,
       initialSearchTerm,
   +    anchorRef,
     }: SearchDialogProps) {
       ...
   -  // Drag state (session-only, resets on refresh)
   +  // Drag state (session-only, resets on close)
       const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
       const isDragging = useRef(false);
       ...

   +  // アンカー基準の初期位置（エディタ領域の右上）
   +  const [anchorPos, setAnchorPos] = useState<{ top: number; right: number } | null>(null);
   +
       const handleDragMouseDown = useCallback(...)
       ...

   +  // アンカー要素の getBoundingClientRect() からダイアログ初期位置を計算する。
   +  // portal により document.body 直下に render されるため座標は viewport 基準になる。
   +  // close 時は dragOffset と anchorPos をリセットし、次回 open で再計算する。
   +  // anchorRef は安定 ref オブジェクトで、依存配列に置いても .current 変更では再実行されない。
   +  // 主トリガーは isOpen → true 遷移。exhaustive-deps lint を満たすため明示列挙する。
   +  // 冪等: anchorRef.current が同じなら同一値を setAnchorPos するため React 19 Strict Mode の
   +  // double-invoke でも問題なし。
   +  useEffect(() => {
   +    if (isOpen && anchorRef?.current) {
   +      const rect = anchorRef.current.getBoundingClientRect();
   +      setAnchorPos(
   +        computeAnchorPos(
   +          { top: rect.top, right: rect.right },
   +          window.innerWidth,
   +          DIALOG_WIDTH,
   +          DIALOG_PADDING,
   +        ),
   +      );
   +    }
   +    if (!isOpen) {
   +      setAnchorPos(null);
   +      setDragOffset(null);
   +    }
   +  }, [isOpen, anchorRef]);
   +
   +  // close 時にドラッグ中フラグを落とす。
   +  // isDragging.current = false により mousemove ハンドラが early-return し
   +  // stale なポインタイベントが position 更新を起こさなくなる。
   +  useEffect(() => {
   +    if (!isOpen) {
   +      isDragging.current = false;
   +    }
   +  }, [isOpen]);
   ```

3. [ ] `handleDragMouseDown` 内の `handleMouseMove` を「`isDragging.current` が false なら early-return + cleanup（mouseup を待たずに listener を外す）」に確実化:

   ```diff
       const handleMouseMove = (ev: MouseEvent) => {
   -      if (!isDragging.current) return;
   +      // close で isDragging が落とされた場合は listener も即時撤去する。
   +      // これにより portal unmount 後にも listener が残るリークを防ぐ。
   +      // removeEventListener は idempotent な DOM API なので handleMouseUp が後で
   +      // 同じ listener を再度 remove しても no-op で安全。
   +      if (!isDragging.current) {
   +        document.removeEventListener("mousemove", handleMouseMove);
   +        document.removeEventListener("mouseup", handleMouseUp);
   +        return;
   +      }
         const dx = ev.clientX - dragStart.current.mouseX;
         const dy = ev.clientY - dragStart.current.mouseY;
         setDragOffset({ x: dragStart.current.elX + dx, y: dragStart.current.elY + dy });
       };
   ```

   元 PR では `isDragging.current = false` だけ落として listener は次の mouseup を待っていた。本 sub-issue 1472 の「ドラッグクリーンアップ」を厳格化するため、close 中の最初の mousemove で listener を能動的に撤去する（idle 状態で mouseup 来ない場合のリーク防止）。後続の `handleMouseUp` も同じ remove を呼ぶが、`removeEventListener` は登録されていない listener に対しても no-op なので、二重 remove は安全。

4. [ ] render 部分を portal 化:

   ```diff
     if (!isOpen) return null;

   -  return (
   +  const posStyle = dragOffset
   +    ? { left: dragOffset.x, top: dragOffset.y, right: "auto" }
   +    : anchorPos
   +      ? { top: anchorPos.top, right: anchorPos.right }
   +      : { top: 64, right: 16 }; // anchorRef なし時のフォールバック (web で使用)
   +
   +  return createPortal(
         <div
           ref={dialogRef}
   -        className="fixed z-50 bg-background-elevated/80 backdrop-blur-xl rounded-lg shadow-lg border border-border/50 p-4 w-80 cursor-grab active:cursor-grabbing"
   -        style={
   -          dragOffset
   -            ? { left: dragOffset.x, top: dragOffset.y, right: "auto" }
   -            : { top: 64, right: 16 }
   -        }
   +        className="fixed z-[9999] bg-background-elevated/80 backdrop-blur-xl rounded-lg shadow-lg border border-border/50 p-4 w-80 cursor-grab active:cursor-grabbing"
   +        style={posStyle}
           onKeyDown={handleKeyDown}
           onMouseDown={handleDragMouseDown}
         >
           ...
   -    </div>
   +    </div>,
   +    document.body,
     );
   }
   ```

### Verification

```bash
npx tsc --noEmit
npx vitest run components/__tests__ lib/search-dialog/__tests__
```

期待: 既存テスト PASS、Task 2 の純関数テスト PASS、TypeScript エラーなし。

---

## Task 4: `Editor.tsx` から `anchorRef` を渡す

**Why**: SearchDialog の `anchorRef` が undefined だと fallback 位置 (`{ top: 64, right: 16 }`) になり Portal の利点を活かせない。

### Steps

1. [ ] `components/Editor.tsx` の SearchDialog 呼び出しに 1 行追加:

   ```diff
   -      {/* 検索ダイアログ */}
   +      {/* 検索ダイアログ（portal で document.body 直下に render。anchorRef でエディタ位置を計算）*/}
         <SearchDialog
   +        anchorRef={scrollContainerRef}
           editorView={editorViewInstance}
           isOpen={isSearchOpen}
           onClose={() => setIsSearchOpen(false)}
           onShowAllResults={onShowAllSearchResults}
           initialSearchTerm={contextMenuSearchTerm ?? searchInitialTerm}
         />
   ```

   `scrollContainerRef` は既に `components/Editor.tsx` 内で `useRef<HTMLDivElement | null>(null)` として宣言済み（line 111）。SearchDialogProps の anchorRef は `RefObject<HTMLElement | null>` なので `HTMLDivElement | null` で互換。

### Verification

```bash
npx tsc --noEmit
```

期待: 型エラーなし。

**注意:** `Editor.tsx` / `MilkdownEditor.tsx` には既存の TS2322（RefObject null 互換性）エラーが存在する可能性がある（memory: project repo state）。`anchorRef` 追加前後で `npx tsc --noEmit 2>&1 | wc -l` を比較し、エラー件数が増えていないことを明示的に確認する。

---

## Task 5: `EditorLayout.tsx` で active panel wrapper に `onFocus` を追加

**Why**: 複数エディタ panel が開いている状態で、キーボードや context-menu 経由でエディタが切り替わったとき dockview の `activeTabId` が同期されないと、`editorViewInstance` が古い panel を指したまま CMD+F すると anchorRef が誤った scrollContainer を参照する。Issue #1472 の「既存の検索動作が壊れないこと」を守るために必要。

### Steps

1. [ ] `components/EditorLayout.tsx` の active panel wrapper (line 444 付近) に追加:

   ```diff
                             <div
                               ref={mainArea.editorDomRef as React.RefObject<HTMLDivElement>}
                               className="h-full"
   +                            // NOTE: onFocus は子孫（Milkdown contenteditable）からの bubble を利用。
   +                            // tabIndex は不要。パネルへのフォーカスを dockview に伝え activeTabId を最新化する。
   +                            onFocus={() => panelApi.setActive()}
                             >
   ```

### Verification

- `npx tsc --noEmit` — 型エラーなし
- 既存の inactive panel wrapper の `onClick={() => panelApi.setActive()}` と整合的に動作することを Task 7 の手動検証で確認

---

## Task 6: ライフサイクル / リークの regression test を書く（jsdom + react-dom/client）

**Why**: 受け入れ条件「mount/unmount/ドラッグ後のリーク検出」を満たす最小テスト。`@testing-library/react` を導入せず、本リポジトリ慣例（`page-size-selector.test.ts` 方式）に従う。

### 設計方針（fallback review 後の改訂）

初稿で計画した「`dialogEl.dispatchEvent("mousedown")` → React `onMouseDown` 起動」のアプローチは React 17+ の **synthetic event delegation** に阻まれる:

- React 18/19 の `createRoot(container)` は root listener を `container` に登録する。
- `createPortal(node, document.body)` は `node` を `document.body` 直下に配置する。
- `container` が `document.body` の子であっても、portal 先 `node` は `container` の DOM 子孫ではない（兄弟）。
- 結果、portal 内で native mousedown を dispatch しても、bubble path は `dialog → body → document` で `container` に到達せず、React の delegated handler は呼ばれない。

回避策として **root を `document.body` に直接 createRoot する**。これにより portal 先（同じく `document.body`）の native event が root listener に届く。後始末は `root.unmount()` + `document.body.innerHTML = ''` で確実に。

また R3 で指摘されたとおり、`createPortal(<div className="fixed ..." />, document.body)` は `<div>` を **直接** `body` の子として配置するため、セレクタは `body > div.fixed`（× `body > div > div.fixed`）。

### Steps

1. [ ] `components/__tests__/search-dialog-drag-cleanup.test.tsx` を新規作成:

   ```tsx
   /**
    * Regression tests for SearchDialog drag/portal lifecycle.
    *
    * Issue #1472: ensure
    *  - the dialog is portal-rendered to document.body (escape dockview's containing block)
    *  - listener and drag state do not leak after the dialog is closed
    *  - reopening recomputes anchor position from the current layout
    *
    * Uses jsdom + react-dom/client (no @testing-library/react in this project).
    * NOTE: React root is mounted on document.body so that synthetic event
    * delegation covers the portal target (which is also document.body).
    */

   import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
   import React from "react";
   import { createRoot, type Root } from "react-dom/client";
   import { act } from "react";
   import SearchDialog from "../SearchDialog";

   // SearchDialog は editorView を触る effect を持つので、null を渡して decoration path を no-op にする。
   // (editorView == null 時は matches/decorations effect が早期 return する)

   let root: Root;
   let anchorEl: HTMLDivElement;

   beforeEach(() => {
     // jsdom はレイアウト計算をしないため getBoundingClientRect を stub する anchor を用意
     anchorEl = document.createElement("div");
     anchorEl.setAttribute("data-test-anchor", "");
     anchorEl.getBoundingClientRect = () =>
       ({
         top: 64,
         right: 1000,
         left: 0,
         bottom: 600,
         width: 1000,
         height: 536,
         x: 0,
         y: 64,
         toJSON: () => ({}),
       }) as DOMRect;
     document.body.appendChild(anchorEl);

     // React root を document.body にマウントすることで portal 先と root container を一致させる。
     // これにより React 18/19 の event delegation が portal 内 native event を補足できる。
     root = createRoot(document.body);
     Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
   });

   afterEach(() => {
     act(() => root.unmount());
     // body をクリーンに戻す（anchorEl 含めて削除）
     document.body.innerHTML = "";
     vi.restoreAllMocks();
   });

   function render(isOpen: boolean) {
     const anchorRef = { current: anchorEl };
     act(() => {
       root.render(
         <SearchDialog
           editorView={null}
           isOpen={isOpen}
           onClose={() => {}}
           anchorRef={anchorRef}
         />,
       );
     });
   }

   function queryDialog(): HTMLDivElement | null {
     // createPortal(<div className="fixed ...">, document.body) は div を body 直下に置く
     return document.body.querySelector(":scope > div.fixed") as HTMLDivElement | null;
   }

   describe("SearchDialog – portal rendering", () => {
     it("renders the dialog as a direct child of document.body", () => {
       render(true);
       const dialog = queryDialog();
       expect(dialog).not.toBeNull();
       expect(dialog!.parentElement).toBe(document.body);
     });

     it("removes the portal node when isOpen toggles to false", () => {
       render(true);
       expect(queryDialog()).not.toBeNull();
       render(false);
       expect(queryDialog()).toBeNull();
     });

     it("applies z-[9999] class to escape dockview overlays", () => {
       render(true);
       const dialog = queryDialog();
       expect(dialog).not.toBeNull();
       expect(dialog!.className).toContain("z-[9999]");
     });
   });

   describe("SearchDialog – anchor position recomputation", () => {
     it("uses anchorPos for top after open (computed from anchor rect)", () => {
       render(true);
       const dialog = queryDialog();
       // anchor.top = 64, padding = 16 → top = 64 + 8 = 72
       expect(dialog!.style.top).toBe("72px");
     });

     it("recomputes initial position on reopen (no stale dragOffset)", () => {
       render(true);
       const dialogA = queryDialog();
       expect(dialogA).not.toBeNull();
       // close then reopen
       render(false);
       render(true);
       const dialogB = queryDialog();
       expect(dialogB).not.toBeNull();
       // left は dragOffset 由来なので reopen 後は空 (right で位置決め)
       expect(dialogB!.style.left).toBe("");
       // top は anchorPos.top (= 72px) 由来で再計算される
       expect(dialogB!.style.top).toBe("72px");
     });
   });

   describe("SearchDialog – drag listener cleanup", () => {
     it("registers mousemove/mouseup on mousedown and removes on mouseup", () => {
       const addSpy = vi.spyOn(document, "addEventListener");
       const removeSpy = vi.spyOn(document, "removeEventListener");
       render(true);
       const dialog = queryDialog();
       expect(dialog).not.toBeNull();

       // mousedown on the dialog frame (not on interactive elements).
       // React root は document.body にあるため、native mousedown は React の synthetic
       // event handler (onMouseDown) を発火する。
       act(() => {
         dialog!.dispatchEvent(
           new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }),
         );
       });
       const mousemoveAdds = addSpy.mock.calls.filter(([t]) => t === "mousemove").length;
       const mouseupAdds = addSpy.mock.calls.filter(([t]) => t === "mouseup").length;
       expect(mousemoveAdds).toBeGreaterThanOrEqual(1);
       expect(mouseupAdds).toBeGreaterThanOrEqual(1);

       act(() => {
         document.dispatchEvent(new MouseEvent("mouseup"));
       });
       const mousemoveRemoves = removeSpy.mock.calls.filter(([t]) => t === "mousemove").length;
       const mouseupRemoves = removeSpy.mock.calls.filter(([t]) => t === "mouseup").length;
       expect(mousemoveRemoves).toBeGreaterThanOrEqual(1);
       expect(mouseupRemoves).toBeGreaterThanOrEqual(1);
     });

     it("cleans up listeners on next mousemove if dialog closes mid-drag", () => {
       const removeSpy = vi.spyOn(document, "removeEventListener");
       render(true);
       const dialog = queryDialog();
       expect(dialog).not.toBeNull();

       // start drag
       act(() => {
         dialog!.dispatchEvent(
           new MouseEvent("mousedown", { bubbles: true, clientX: 50, clientY: 50 }),
         );
       });

       // close without mouseup → useEffect sets isDragging.current = false
       render(false);

       // 次の mousemove で listener 自己撤去ロジックが発火する
       act(() => {
         document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, clientY: 500 }));
       });

       const mousemoveRemoves = removeSpy.mock.calls.filter(([t]) => t === "mousemove").length;
       expect(mousemoveRemoves).toBeGreaterThanOrEqual(1);
     });
   });
   ```

   重要な実装上の注意:
   - `editorView={null}` を渡すことで decoration / search effect の重い経路を無効化（既存の early-return を利用）。
   - **React root を `document.body` に直接 createRoot する**ことで synthetic event delegation が portal 経路を正しくカバーする（R4 対応）。
   - portal 直下要素のセレクタは `:scope > div.fixed`（R3 対応）。`body > div > div.fixed` ではない。
   - `act()` の import 元は React 19 では `"react"`（`react-dom/test-utils` ではない）。
   - jsdom はレイアウト計算を行わないため `getBoundingClientRect` を stub する必要がある。

### Verification

```bash
npx vitest run components/__tests__/search-dialog-drag-cleanup.test.tsx
```

期待: 7 つすべて PASS。

失敗時のチェックポイント:

- `addEventListener` spy が effect 内の listener 登録を捉えるタイミング: render 直後に mousedown を dispatch する。spy は `render()` より前にセットすると React 内部の他の listener も拾うがフィルタで除外されるので順番は柔軟。
- React root を `document.body` にマウントしたとき、`HMR` 等で warning が出る可能性 → test なので無視可。

---

## Task 7: 手動検証（Electron + Web）

**Why**: portal + dockview + 縦書きモードの組合せは jsdom では検証できない。

### Steps

1. [ ] `pnpm dev` を起動
2. [ ] エディタ panel を開き、CMD+F → ダイアログがエディタ右上に表示される（ViewDock 領域に重ならない）
3. [ ] ダイアログを別の位置にドラッグ → 移動できる
4. [ ] Esc で閉じる
5. [ ] 再度 CMD+F → 初期位置（エディタ右上）に再表示される（前回のドラッグ位置を引きずらない）
6. [ ] エディタ panel を 2 つ開き、左パネルで CMD+F → 左パネル右上に表示される
7. [ ] 右パネルにフォーカス（クリック or Tab）→ CMD+F → 右パネル右上に表示される（onFocus → setActive で activeTabId 同期）
8. [ ] 縦書きモード切替 → CMD+F → ダイアログがエディタ領域基準で表示される（dockview transform の影響を受けない）
9. [ ] 検索ワードを入力 → 次へ / 前へ / Show all results が動作する
10. [ ] ダイアログをドラッグ中に Esc → mouseup なしで close → コンソールに mousemove 由来の警告なし

### Verification

すべて pass し、`ps aux | grep -i electron` で孤立プロセスがないこと（本 issue では PTY kill は scope 外だが、search 動作で副次的に terminal を起動した場合の確認）。

---

## Task 8: 関連 P0 regression の非再発確認

**Why**: 受け入れ条件「#1457 / #1445 の P0 regression を再発させない」。本 issue は search 関連のみだが、`EditorLayout.tsx` の onFocus 追加が editor 起動経路に副作用を持たないか確認する。

### Steps

1. [ ] エディタ panel でテキストを入力 → 編集可能（#1457: editor uneditable）
2. [ ] 縦書き ⇄ 横書きトグル → 編集可能のまま（#1457: vertical toggle）
3. [ ] auth refresh シミュレーション（既存 #1444 fix を破らない確認は scope 外）
4. [ ] external file change 検知時の自己保存抑制が引き続き動作（#1457: hash-aware self-save suppression）

### Verification

- 手動で 1〜2 を実行し OK
- 既存テスト全実行: `npx vitest run` で全 PASS

---

## ロールバック手順

万が一本 PR merge 後に regression が出た場合:

```bash
git revert <merge-commit-sha>
```

影響範囲は 3 ファイル + 3 新規ファイル（pure helper + 2 tests）に限定されているため、リバートのリスクは低い。

## Branch / PR 方針

- Branch: `feature/reimpl-searchdialog-portal` (worktree: `../illusions-work-reimpl-search`)
- PR target: `dev`
- PR タイトル: `fix(search): portal + anchorPos + drag cleanup (re-impl 2/5, #1472)`
- Issue クローズ: PR description に `Closes #1472` を含める
- 親 issue #1464 の進捗チェックボックス更新は PR merge 後に手動で行う

---

## Review Iteration 1 — fallback: Claude sonnet reviewer (Codex unavailable, timed out at 35min)

### Accepted

- **R1** (Task 3 Step 2): `useEffect` deps `[isOpen, anchorRef]` のコメントを追加し、安定 ref オブジェクトを意図的に列挙していることを明示。Strict Mode 冪等性の注記も併記。
- **R2** (Task 3 Steps 2-3): `handleMouseMove` 内 / `handleMouseUp` 両方が `removeEventListener` を呼ぶことに対し、`removeEventListener` が idempotent な DOM API である旨をコメントで明記。
- **R3** (Task 6 MUST FIX): `createPortal(<div className="fixed">, document.body)` は dialog div を **body 直下** に置く。テストのセレクタを `body > div > div.fixed` → `:scope > div.fixed`（`document.body` 起点）に修正。
- **R4** (Task 6 MUST FIX): React 17+ event delegation は root container 上に listener を登録するため、portal 先（body 直下）で dispatch した native mousedown は別 root container には届かない。回避策として `createRoot(document.body)` で root をマウントし、portal 先と root container を一致させる。テスト構造全体を書き換え。
- **R5** (Task 3): React 19 Strict Mode の double-invoke でも冪等であるコメントを effect に追加。
- **R7** (Task 1): clamp コメントを「右端は viewport 内、必要なら左端が viewport 外に出る」に修正（CSS `right` 位置指定の意味論を正確化）。
- **R8** (Task 4): 既存 TS2322 エラーがある可能性を踏まえ、`anchorRef` 追加前後で `tsc --noEmit` のエラー件数比較を verification に明記。

### Rejected

- **R6** (Task 5): `onFocus={() => panelApi.setActive()}` を `if (!isActivePanel)` でガードする提案を却下。理由:
  1. 元 PR #1425 (`commit 3510b35`) も同じく無ガードで実装しており、historical baseline と一致させる方針。
  2. dockview の `panelApi.setActive()` は同一 panel への重複呼び出しを内部で扱う設計と推定される（コミットメッセージ "keeping activeTabId in sync with the typing editor" は冗長 invocation 前提）。
  3. `isActivePanel` は render closure で算出される値で、focus が render 間に到達した場合 stale closure の問題を新たに導入する。
  4. パフォーマンス問題の証拠がない段階で過剰な最適化を加えるのは YAGNI 違反。

### Partially Accepted

- なし

### Informational

- **R9** (Task 2): テスト算術が正しいことを reviewer が確認（情報のみ、変更なし）。

### Reviewer 信頼性メモ

- Codex は 35 分間応答せずに停止したため cancel し、Claude sonnet サブエージェントで fallback レビューを実施した（`plan-with-codex` skill の fallback rule に従う）。Sonnet レビューは file/line citation 付きで grounding rule を満たしている。
- 改訂後の plan に対する追加レビューは省略（R6 のみ reject、他は accept で形式的修正）。Phase 3（user confirmation）へ進む。
