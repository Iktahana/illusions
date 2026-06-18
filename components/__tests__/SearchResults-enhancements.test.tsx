(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  localStorage.clear();
});

function renderSearchResults(
  overrides: Partial<React.ComponentProps<typeof SearchResults>> = {},
): void {
  act(() => {
    root.render(
      <SearchResults
        editorView={null}
        searchTerm="target"
        onSearchTermChange={() => {}}
        caseSensitive={false}
        onCaseSensitiveChange={() => {}}
        regexSearch={false}
        onRegexSearchChange={() => {}}
        wholeWordSearch={false}
        onWholeWordSearchChange={() => {}}
        normalizeVariants={false}
        onNormalizeVariantsChange={() => {}}
        excludeComments
        onExcludeCommentsChange={() => {}}
        searchTarget="all"
        onSearchTargetChange={() => {}}
        selectionOnly={false}
        onSelectionOnlyChange={() => {}}
        hasSelection={false}
        matches={[]}
        currentMatchIndex={0}
        onCurrentMatchIndexChange={() => {}}
        onClose={() => {}}
        {...overrides}
      />,
    );
  });
}

describe("SearchResults enhanced options", () => {
  it("keeps advanced options hidden until requested", () => {
    renderSearchResults();

    expect(container.textContent).toContain("詳細オプション");
    expect(container.textContent).not.toContain("正規表現を使う");

    const detailsButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("詳細オプション"),
    );
    act(() => detailsButton?.click());

    expect(container.textContent).toContain("正規表現を使う");
    expect(container.textContent).toContain("単語単位で一致");
    expect(container.textContent).toContain("表記ゆれを吸収");
  });

  it("reports invalid regular expressions without throwing", () => {
    renderSearchResults({ searchTerm: "(", regexSearch: true });
    expect(container.textContent).toContain("正規表現が正しくありません");
  });

  it("forwards advanced option changes", () => {
    const onRegexSearchChange = vi.fn();
    renderSearchResults({ onRegexSearchChange });

    const detailsButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("詳細オプション"),
    );
    act(() => detailsButton?.click());
    const regexInput = container.querySelector(
      'input[aria-label="正規表現を使う"]',
    ) as HTMLInputElement;
    act(() => regexInput.click());

    expect(onRegexSearchChange).toHaveBeenCalledWith(true);
  });

  it("does not offer replacement for matches containing MDI structure", () => {
    renderSearchResults({
      matches: [
        {
          from: 1,
          to: 2,
          text: "東京",
          source: "ruby-base",
          replaceable: false,
          paragraphNumber: 1,
        },
      ],
    });

    expect(container.textContent).toContain("構造を含むため置換できません");
    expect(container.textContent).toContain("段落 1");
  });

  it("navigates to the previous and next match from the always-visible controls", () => {
    const onCurrentMatchIndexChange = vi.fn();
    renderSearchResults({
      matches: [
        { from: 1, to: 2, text: "a" },
        { from: 3, to: 4, text: "a" },
      ],
      currentMatchIndex: 0,
      onCurrentMatchIndexChange,
    });

    act(() => (container.querySelector('[aria-label="次の一致"]') as HTMLButtonElement).click());
    expect(onCurrentMatchIndexChange).toHaveBeenLastCalledWith(1);

    act(() => (container.querySelector('[aria-label="前の一致"]') as HTMLButtonElement).click());
    expect(onCurrentMatchIndexChange).toHaveBeenLastCalledWith(1);
  });

  it("shows and forwards the comment exclusion filter", () => {
    const onExcludeCommentsChange = vi.fn();
    renderSearchResults({ onExcludeCommentsChange });
    const detailsButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("詳細オプション"),
    );
    act(() => detailsButton?.click());

    const comments = container.querySelector(
      'input[aria-label="コメントを除外"]',
    ) as HTMLInputElement;
    expect(comments.checked).toBe(true);
    act(() => comments.click());
    expect(onExcludeCommentsChange).toHaveBeenCalledWith(false);
  });
});
