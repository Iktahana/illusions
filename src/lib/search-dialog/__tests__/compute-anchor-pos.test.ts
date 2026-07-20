import { describe, it, expect } from "vitest";
import { computeAnchorPos, clampDragPos } from "../compute-anchor-pos";

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

describe("clampDragPos", () => {
  const VIEWPORT_W = 1440;
  const VIEWPORT_H = 900;
  const DIALOG_SIZE = { width: 320, height: 200 };
  const MIN_VISIBLE = 44; // default

  it("leaves a position that is already fully in-viewport unchanged", () => {
    const pos = clampDragPos({ x: 100, y: 100 }, DIALOG_SIZE, VIEWPORT_W, VIEWPORT_H);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(100);
  });

  it("clamps far bottom-right drag back into viewport (header/close button visible)", () => {
    // ダイアログを画面右下の遥か外にドラッグした場合
    const pos = clampDragPos({ x: 99999, y: 99999 }, DIALOG_SIZE, VIEWPORT_W, VIEWPORT_H);
    // x ≤ viewportWidth - minVisibleHeight
    expect(pos.x).toBeLessThanOrEqual(VIEWPORT_W - MIN_VISIBLE);
    // y ≤ viewportHeight - minVisibleHeight
    expect(pos.y).toBeLessThanOrEqual(VIEWPORT_H - MIN_VISIBLE);
  });

  it("clamps far top-left drag so top edge never goes above viewport", () => {
    // ダイアログを画面左上の遥か外にドラッグした場合
    const pos = clampDragPos({ x: -99999, y: -99999 }, DIALOG_SIZE, VIEWPORT_W, VIEWPORT_H);
    // y は 0 未満にならない
    expect(pos.y).toBeGreaterThanOrEqual(0);
    // x は -(dialogWidth - minVisibleHeight) 以上（左端は一部画面外 OK）
    expect(pos.x).toBeGreaterThanOrEqual(-(DIALOG_SIZE.width - MIN_VISIBLE));
  });

  it("re-clamps correctly after window shrinks (resize regression)", () => {
    // 大きいウィンドウでドラッグ → ウィンドウ縮小後に再クランプ
    const originalPos = { x: 1200, y: 700 }; // 元は 1440×900 内で有効
    const smallViewportW = 800;
    const smallViewportH = 500;
    const pos = clampDragPos(originalPos, DIALOG_SIZE, smallViewportW, smallViewportH);
    expect(pos.x).toBeLessThanOrEqual(smallViewportW - MIN_VISIBLE);
    expect(pos.y).toBeLessThanOrEqual(smallViewportH - MIN_VISIBLE);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  it("uses provided minVisibleHeight to keep header accessible", () => {
    const customMin = 56;
    const pos = clampDragPos(
      { x: 99999, y: 99999 },
      DIALOG_SIZE,
      VIEWPORT_W,
      VIEWPORT_H,
      customMin,
    );
    expect(pos.x).toBeLessThanOrEqual(VIEWPORT_W - customMin);
    expect(pos.y).toBeLessThanOrEqual(VIEWPORT_H - customMin);
  });
});
