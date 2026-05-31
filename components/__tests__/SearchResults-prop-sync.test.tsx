/**
 * Tests for SearchResults – issue #1502.
 *
 * Two regressions covered:
 *   1) Prop → state sync: when SearchDialog pushes results via
 *      "すべての検索結果を表示", an already-mounted SearchResults must
 *      reflect the new searchTerm/matches.
 *   2) Replace preview: when replaceTerm is non-empty, results render
 *      VSCode-style diff (strikethrough+red for old text, green for new).
 */

// Tell React this is a controlled test environment so act() flushes effects.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// Stub centerEditorPosition (uses ProseMirror coordsAtPos which is not
// available in jsdom mocks).
vi.mock("@/lib/editor-page/center-editor-position", () => ({
  centerEditorPosition: vi.fn(),
}));

import SearchResults from "../SearchResults";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

/**
 * Wrapper that simulates SidebarPanel's behavior: SearchResults is kept
 * mounted while its props change (the exact scenario from #1502).
 *
 * Note: SearchResults's public prop names are `searchTerm` / `matches`
 * (destructured internally as `initialSearchTerm` / `initialMatches`).
 */
function Wrapper({
  searchTerm,
  matches,
}: {
  searchTerm?: string;
  matches?: { from: number; to: number }[];
}) {
  return (
    <SearchResults editorView={null} onClose={() => {}} searchTerm={searchTerm} matches={matches} />
  );
}

describe("SearchResults – prop sync (#1502)", () => {
  it("reflects updated initialSearchTerm / initialMatches without remount", async () => {
    // Mount with no initial term — empty placeholder appears
    await act(async () => {
      root.render(<Wrapper />);
    });
    expect(container.textContent).toContain("検索語を入力してください");

    // Re-render the SAME root with new props — this is what happens when
    // SidebarPanel re-renders due to setSearchResults({...}) state change.
    // The case branch is still "search" so SearchResults is updated, not
    // remounted.
    await act(async () => {
      root.render(
        <Wrapper
          searchTerm="四月一日"
          matches={[
            { from: 5, to: 9 },
            { from: 328, to: 332 },
          ]}
        />,
      );
    });

    // After prop sync, placeholder should be gone and input should reflect
    // the new searchTerm.
    expect(container.textContent).not.toContain("検索語を入力してください");
    const input = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.value).toBe("四月一日");
    expect(container.textContent).toContain("2件見つかりました");
  });
});

describe("SearchResults – replace preview (#1502)", () => {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  function findInputByPlaceholder(placeholder: string): HTMLInputElement | undefined {
    return Array.from(container.querySelectorAll('input[type="text"]')).find(
      (el) => (el as HTMLInputElement).placeholder === placeholder,
    ) as HTMLInputElement | undefined;
  }

  it("shows old (strikethrough+red) and new (green) when replaceTerm is set", async () => {
    await act(async () => {
      root.render(<Wrapper searchTerm="四月一日" matches={[{ from: 5, to: 9 }]} />);
    });

    // Confirm fresh mount worked
    expect(container.textContent).toContain("1件見つかりました");

    const replaceInput = findInputByPlaceholder("置換後...");
    expect(replaceInput).toBeDefined();

    await act(async () => {
      nativeInputValueSetter?.call(replaceInput!, "ああああ");
      replaceInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const oldNode = container.querySelector('[data-testid="replace-preview-old"]');
    const newNode = container.querySelector('[data-testid="replace-preview-new"]');
    expect(oldNode).not.toBeNull();
    expect(newNode).not.toBeNull();
    expect(oldNode!.className).toMatch(/line-through/);
    expect(oldNode!.className).toMatch(/red/);
    expect(newNode!.className).toMatch(/green/);
    expect(newNode!.textContent).toBe("ああああ");
  });

  it("falls back to plain highlight when replaceTerm is empty", async () => {
    await act(async () => {
      root.render(<Wrapper searchTerm="四月一日" matches={[{ from: 5, to: 9 }]} />);
    });

    // No replace preview rendered when replaceTerm is empty
    expect(container.querySelector('[data-testid="replace-preview-old"]')).toBeNull();
    expect(container.querySelector('[data-testid="replace-preview-new"]')).toBeNull();
  });
});
