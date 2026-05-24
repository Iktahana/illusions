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
