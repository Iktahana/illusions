/**
 * Real-mount tests for SnapshotItem — added ALONGSIDE (not replacing)
 * SnapshotItem-keyboard-guard.test.tsx, which deliberately mounts a
 * hand-copied "mirror" component rather than the real one (a named,
 * intentional pattern in this repo). This file mounts the real component,
 * covering the click-to-compare (#1644), bookmark, and menu behavior that
 * the mirror test never exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import SnapshotItem from "../SnapshotItem";
import type { SnapshotEntry } from "@/lib/services/history-service";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function makeSnapshot(overrides: Partial<SnapshotEntry> = {}): SnapshotEntry {
  return {
    id: "snap-1",
    timestamp: new Date("2026-07-01T12:34:00").getTime(),
    filename: "main.mdi.[20260701123400_0000].history",
    sourcePath: "main.mdi",
    displayName: "main.mdi",
    type: "manual",
    characterCount: 1234,
    fileSize: 5678,
    checksum: "deadbeef",
    ...overrides,
  };
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof SnapshotItem>> = {}) {
  return {
    snapshot: makeSnapshot(),
    isRestoring: false,
    onRestore: vi.fn(),
    onCompare: vi.fn(),
    isLoadingDiff: false,
    isFirstVersion: false,
    isBookmarked: false,
    onToggleBookmark: vi.fn(),
    ...overrides,
  };
}

function getCard(): HTMLElement {
  const card = container.querySelector('[role="button"]');
  if (!card) throw new Error("card not found");
  return card as HTMLElement;
}

function getButtons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button"));
}

describe("SnapshotItem (real mount)", () => {
  it("renders time, type badge, and character count", async () => {
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps()} />);
    });

    expect(container.textContent).toContain("1,234文字");
    expect(container.textContent).toContain("手動");
  });

  it("renders the milestone pin + label when type is milestone with a label", async () => {
    await act(async () => {
      root.render(
        <SnapshotItem
          {...defaultProps({
            snapshot: makeSnapshot({ type: "milestone", label: "Draft v1.0" }),
          })}
        />,
      );
    });

    expect(container.textContent).toContain("Draft v1.0");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("omits the label paragraph when there is no label", async () => {
    await act(async () => {
      root.render(
        <SnapshotItem {...defaultProps({ snapshot: makeSnapshot({ label: undefined }) })} />,
      );
    });

    // No label text rendered as a dedicated paragraph
    expect(container.querySelector("p")).toBeNull();
  });

  it("clicking the card body calls onCompare (#1644 click-to-compare)", async () => {
    const onCompare = vi.fn();
    const snapshot = makeSnapshot();
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps({ onCompare, snapshot })} />);
    });

    await act(async () => {
      getCard().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCompare).toHaveBeenCalledWith(snapshot);
  });

  it("does not call onCompare when isLoadingDiff is true", async () => {
    const onCompare = vi.fn();
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps({ onCompare, isLoadingDiff: true })} />);
    });

    await act(async () => {
      getCard().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCompare).not.toHaveBeenCalled();
  });

  it("clicking the bookmark button calls onToggleBookmark and does not also trigger onCompare", async () => {
    const onCompare = vi.fn();
    const onToggleBookmark = vi.fn();
    const snapshot = makeSnapshot();
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps({ onCompare, onToggleBookmark, snapshot })} />);
    });

    const bookmarkButton = getButtons().find((b) => b.title.includes("ブックマーク"));
    if (!bookmarkButton) throw new Error("bookmark button not found");

    await act(async () => {
      bookmarkButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggleBookmark).toHaveBeenCalledWith(snapshot.id);
    expect(onCompare).not.toHaveBeenCalled();
  });

  it("bookmark icon fill reflects isBookmarked", async () => {
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps({ isBookmarked: true })} />);
    });
    const filledSvg = container.querySelector('svg[fill="currentColor"]');
    expect(filledSvg).not.toBeNull();

    await act(async () => {
      root.render(<SnapshotItem {...defaultProps({ isBookmarked: false })} />);
    });
    const outlineSvg = container.querySelector('svg[fill="none"]');
    expect(outlineSvg).not.toBeNull();
  });

  it("opens and closes the three-dot menu, and closes on outside mousedown", async () => {
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps()} />);
    });

    const menuButton = getButtons().find((b) => b.title === "メニュー");
    if (!menuButton) throw new Error("menu button not found");

    await act(async () => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("復元");
    expect(container.textContent).toContain("比較");

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(getButtons().find((b) => b.textContent?.includes("復元"))).toBeUndefined();
  });

  it("clicking 復元 in the menu calls onRestore and closes the menu", async () => {
    const onRestore = vi.fn();
    const snapshot = makeSnapshot();
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps({ onRestore, snapshot })} />);
    });

    const menuButton = getButtons().find((b) => b.title === "メニュー")!;
    await act(async () => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const restoreItem = getButtons().find((b) => b.textContent?.includes("復元"))!;
    await act(async () => {
      restoreItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRestore).toHaveBeenCalledWith(snapshot);
    expect(getButtons().find((b) => b.textContent?.includes("比較"))).toBeUndefined();
  });

  it("disables the 復元 menu item and shows a spinner while isRestoring", async () => {
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps({ isRestoring: true })} />);
    });

    const menuButton = getButtons().find((b) => b.title === "メニュー")!;
    await act(async () => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const restoreItem = getButtons().find((b) => b.textContent?.includes("復元"))!;
    expect(restoreItem.disabled).toBe(true);
  });

  it("clicking 比較 in the menu calls onCompare", async () => {
    const onCompare = vi.fn();
    const snapshot = makeSnapshot();
    await act(async () => {
      root.render(<SnapshotItem {...defaultProps({ onCompare, snapshot })} />);
    });

    const menuButton = getButtons().find((b) => b.title === "メニュー")!;
    await act(async () => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const compareItem = getButtons().find((b) => b.textContent?.includes("比較"))!;
    await act(async () => {
      compareItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCompare).toHaveBeenCalledWith(snapshot);
  });
});
