/**
 * Real-mount tests for EditorDiffView — previously had NO test at all
 * (confirmed via repo-wide grep). Covers rendering, the empty-diff message,
 * added/removed span styling, typography-settings flow-through, paragraph
 * splitting, and the auto-scroll-to-first-diff behavior (#1644).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import EditorDiffView from "../EditorDiffView";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const typographySettingsMock = vi.fn(() => ({
  fontScale: 100,
  lineHeight: 1.8,
  fontFamily: "serif",
  charsPerLine: 40,
  textIndent: 1,
  paragraphSpacing: 0.5,
}));

vi.mock("@/contexts/EditorSettingsContext", () => ({
  useTypographySettings: () => typographySettingsMock(),
}));

let root: Root;
let container: HTMLDivElement;
let scrollIntoViewMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  typographySettingsMock.mockReturnValue({
    fontScale: 100,
    lineHeight: 1.8,
    fontFamily: "serif",
    charsPerLine: 40,
    textIndent: 1,
    paragraphSpacing: 0.5,
  });
  // jsdom does not implement scrollIntoView at all (throws TypeError if
  // called unstubbed) — the component calls it inside a requestAnimationFrame
  // for its auto-scroll-to-first-diff effect.
  scrollIntoViewMock = vi.fn();
  window.HTMLElement.prototype.scrollIntoView =
    scrollIntoViewMock as unknown as typeof HTMLElement.prototype.scrollIntoView;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flushRaf(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof EditorDiffView>> = {}) {
  return {
    snapshotContent: "old content",
    currentContent: "new content",
    snapshotLabel: "14:30 (自動)",
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("EditorDiffView (real mount)", () => {
  it("renders the snapshot label, stat header, and legend", async () => {
    await act(async () => {
      root.render(<EditorDiffView {...defaultProps()} />);
    });
    await flushRaf();

    expect(container.textContent).toContain("14:30 (自動)");
    expect(container.textContent).toContain("追加");
    expect(container.textContent).toContain("削除");
  });

  it("shows the empty-diff message when snapshotContent equals currentContent", async () => {
    await act(async () => {
      root.render(
        <EditorDiffView {...defaultProps({ snapshotContent: "same", currentContent: "same" })} />,
      );
    });
    await flushRaf();

    expect(container.textContent).toContain("テキストの差分はありません");
  });

  it("renders added/removed spans with correct classes when content differs", async () => {
    await act(async () => {
      root.render(
        <EditorDiffView
          {...defaultProps({ snapshotContent: "abXcd", currentContent: "abYYcd" })}
        />,
      );
    });
    await flushRaf();

    // Scope to the diff content area — the header legend swatches also use
    // bg-success/20 / bg-error/20, so an unscoped query would match those instead.
    const contentArea = container.querySelector(".p-8.mx-auto") as HTMLElement;
    const added = contentArea.querySelector("span.bg-success\\/20");
    const removed = contentArea.querySelector("span.bg-error\\/20");
    expect(added).not.toBeNull();
    expect(removed).not.toBeNull();
    expect(added!.classList.contains("line-through")).toBe(false);
    expect(removed!.classList.contains("line-through")).toBe(true);
  });

  it("clicking the close button calls onClose", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<EditorDiffView {...defaultProps({ onClose })} />);
    });
    await flushRaf();

    const closeButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("閉じる"),
    )!;
    await act(async () => {
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("flows typography settings through into inline styles", async () => {
    typographySettingsMock.mockReturnValue({
      fontScale: 120,
      lineHeight: 2,
      fontFamily: "Mincho",
      charsPerLine: 35,
      textIndent: 1,
      paragraphSpacing: 0.5,
    });

    await act(async () => {
      root.render(<EditorDiffView {...defaultProps()} />);
    });
    await flushRaf();

    const contentDiv = container.querySelector(".p-8.mx-auto") as HTMLElement;
    expect(contentDiv.style.fontSize).toBe("120%");
    expect(contentDiv.style.maxWidth).toBe("35em");
    expect(contentDiv.style.fontFamily).toContain("Mincho");
  });

  it("splits content into paragraphs on newlines with textIndent/marginBottom styles", async () => {
    await act(async () => {
      root.render(
        <EditorDiffView
          {...defaultProps({
            snapshotContent: "para one\npara two",
            currentContent: "para one\npara two changed",
          })}
        />,
      );
    });
    await flushRaf();

    const paragraphs = container.querySelectorAll("p");
    // At least the two source paragraphs (the empty-diff message path is not taken here)
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    const firstP = paragraphs[0] as HTMLElement;
    expect(firstP.style.textIndent).toBe("1em");
    expect(firstP.style.marginBottom).toBe("0.5em");
  });

  it("auto-scrolls to the first changed span exactly once on mount", async () => {
    await act(async () => {
      root.render(
        <EditorDiffView
          {...defaultProps({ snapshotContent: "abXcdXef", currentContent: "abYcdZef" })}
        />,
      );
    });
    await flushRaf();

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
  });

  it("re-triggers the scroll effect when snapshotContent changes (new chunks)", async () => {
    const { rerender } = { rerender: (el: React.ReactElement) => root.render(el) };

    await act(async () => {
      root.render(
        <EditorDiffView {...defaultProps({ snapshotContent: "a", currentContent: "b" })} />,
      );
    });
    await flushRaf();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<EditorDiffView {...defaultProps({ snapshotContent: "c", currentContent: "d" })} />);
    });
    await flushRaf();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
  });
});
