/**
 * Regression test for #1853: keyboard Enter/Space on nested buttons
 * must NOT fire onCompare on the parent card.
 *
 * Root cause: the card role="button" had an onKeyDown that unconditionally
 * called onCompare when Enter or Space was pressed, even when the event
 * originated from a nested button (bookmark / menu toggle). The fix guards
 * with `e.target === e.currentTarget` so only direct card focus triggers compare.
 *
 * The test renders a minimal component that mirrors SnapshotItem's keydown
 * shape to keep the test free of heavy dependency mocks (icons, DiffIndicator,
 * storage services, etc.), following the project's existing inline-mirror pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// Minimal mirror of SnapshotItem's keyboard guard shape
function SnapshotCard({
  onCompare,
  onToggleBookmark,
  onMenuToggle,
  isLoadingDiff = false,
}: {
  onCompare: () => void;
  onToggleBookmark: () => void;
  onMenuToggle: () => void;
  isLoadingDiff?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="card"
      onClick={() => {
        if (!isLoadingDiff) onCompare();
      }}
      onKeyDown={(e) => {
        if (
          (e.key === "Enter" || e.key === " ") &&
          !isLoadingDiff &&
          e.target === e.currentTarget
        ) {
          e.preventDefault();
          onCompare();
        }
      }}
    >
      <button
        data-testid="bookmark-btn"
        onClick={(e) => {
          e.stopPropagation();
          onToggleBookmark();
        }}
      >
        ブックマーク
      </button>
      <button
        data-testid="menu-btn"
        onClick={(e) => {
          e.stopPropagation();
          onMenuToggle();
        }}
      >
        メニュー
      </button>
    </div>
  );
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("#1853 regression — nested button keyboard events must not fire onCompare", () => {
  it("Enter on bookmark button calls onToggleBookmark and does NOT call onCompare", () => {
    const onCompare = vi.fn();
    const onToggleBookmark = vi.fn();
    const onMenuToggle = vi.fn();

    act(() => {
      root.render(
        <SnapshotCard
          onCompare={onCompare}
          onToggleBookmark={onToggleBookmark}
          onMenuToggle={onMenuToggle}
        />,
      );
    });

    const bookmarkBtn = container.querySelector(
      "[data-testid='bookmark-btn']",
    ) as HTMLButtonElement;

    act(() => {
      bookmarkBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onCompare).not.toHaveBeenCalled();
  });

  it("Space on bookmark button does NOT call onCompare", () => {
    const onCompare = vi.fn();

    act(() => {
      root.render(
        <SnapshotCard onCompare={onCompare} onToggleBookmark={vi.fn()} onMenuToggle={vi.fn()} />,
      );
    });

    const bookmarkBtn = container.querySelector(
      "[data-testid='bookmark-btn']",
    ) as HTMLButtonElement;

    act(() => {
      bookmarkBtn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });

    expect(onCompare).not.toHaveBeenCalled();
  });

  it("Enter on menu button does NOT call onCompare", () => {
    const onCompare = vi.fn();

    act(() => {
      root.render(
        <SnapshotCard onCompare={onCompare} onToggleBookmark={vi.fn()} onMenuToggle={vi.fn()} />,
      );
    });

    const menuBtn = container.querySelector("[data-testid='menu-btn']") as HTMLButtonElement;

    act(() => {
      menuBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onCompare).not.toHaveBeenCalled();
  });

  it("Space on menu button does NOT call onCompare", () => {
    const onCompare = vi.fn();

    act(() => {
      root.render(
        <SnapshotCard onCompare={onCompare} onToggleBookmark={vi.fn()} onMenuToggle={vi.fn()} />,
      );
    });

    const menuBtn = container.querySelector("[data-testid='menu-btn']") as HTMLButtonElement;

    act(() => {
      menuBtn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });

    expect(onCompare).not.toHaveBeenCalled();
  });

  it("Enter directly on the card itself DOES call onCompare", () => {
    const onCompare = vi.fn();

    act(() => {
      root.render(
        <SnapshotCard onCompare={onCompare} onToggleBookmark={vi.fn()} onMenuToggle={vi.fn()} />,
      );
    });

    const card = container.querySelector("[data-testid='card']") as HTMLDivElement;

    act(() => {
      card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it("Space directly on the card itself DOES call onCompare", () => {
    const onCompare = vi.fn();

    act(() => {
      root.render(
        <SnapshotCard onCompare={onCompare} onToggleBookmark={vi.fn()} onMenuToggle={vi.fn()} />,
      );
    });

    const card = container.querySelector("[data-testid='card']") as HTMLDivElement;

    act(() => {
      card.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });

    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it("Enter on card does NOT call onCompare when isLoadingDiff is true", () => {
    const onCompare = vi.fn();

    act(() => {
      root.render(
        <SnapshotCard
          onCompare={onCompare}
          onToggleBookmark={vi.fn()}
          onMenuToggle={vi.fn()}
          isLoadingDiff={true}
        />,
      );
    });

    const card = container.querySelector("[data-testid='card']") as HTMLDivElement;

    act(() => {
      card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onCompare).not.toHaveBeenCalled();
  });
});
