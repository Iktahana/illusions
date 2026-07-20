import { describe, it, expect } from "vitest";

import {
  decideResponsivePanels,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MAIN_MIN_READABLE_WIDTH,
} from "../responsive-layout";

describe("decideResponsivePanels", () => {
  it("wide window keeps both panels open", () => {
    const d = decideResponsivePanels({
      windowWidth: 1400,
      compactMode: false,
      rightAlreadyCollapsed: false,
    });
    expect(d.collapseLeft).toBe(false);
    expect(d.collapseRight).toBe(false);
  });

  it("collapses right panel first when main gets cramped", () => {
    // 48 + 200*2 = 448 オーバーヘッド。本文確保に MAIN_MIN_READABLE_WIDTH 必要。
    // 800 - 448 = 352 < 360 → 右を畳む。800 - 48 - 200 = 552 >= 360 → 左は維持。
    const d = decideResponsivePanels({
      windowWidth: 800,
      compactMode: false,
      rightAlreadyCollapsed: false,
    });
    expect(d.collapseRight).toBe(true);
    expect(d.collapseLeft).toBe(false);
  });

  it("collapses both panels at the minimum window width", () => {
    // 640 - 48 - 200 = 392 >= 360 → 左は維持されるが右は畳まれる。
    const d = decideResponsivePanels({
      windowWidth: MIN_WINDOW_WIDTH,
      compactMode: false,
      rightAlreadyCollapsed: false,
    });
    expect(d.collapseRight).toBe(true);
    expect(d.collapseLeft).toBe(false);
  });

  it("collapses left panel too when even one panel leaves main too narrow", () => {
    // 560 - 48 - 200 = 312 < 360 → 左も畳む。
    const d = decideResponsivePanels({
      windowWidth: 560,
      compactMode: false,
      rightAlreadyCollapsed: false,
    });
    expect(d.collapseRight).toBe(true);
    expect(d.collapseLeft).toBe(true);
  });

  it("does not auto-collapse the right panel when user already collapsed it", () => {
    const d = decideResponsivePanels({
      windowWidth: 800,
      compactMode: false,
      rightAlreadyCollapsed: true,
    });
    expect(d.collapseRight).toBe(false);
  });

  it("uses compact panel widths in compact mode", () => {
    // compact: 40 + 160*2 = 360 オーバーヘッド。760 - 360 = 400 >= 360 → 維持。
    const d = decideResponsivePanels({
      windowWidth: 760,
      compactMode: true,
      rightAlreadyCollapsed: false,
    });
    expect(d.collapseRight).toBe(false);
    expect(d.collapseLeft).toBe(false);
  });

  it("exposes sane window-size floors", () => {
    expect(MIN_WINDOW_WIDTH).toBeGreaterThanOrEqual(MAIN_MIN_READABLE_WIDTH);
    expect(MIN_WINDOW_HEIGHT).toBeGreaterThan(0);
  });
});
