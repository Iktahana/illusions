(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, useEffect } from "react";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { usePanelState } from "@/lib/editor-page/use-panel-state";

type PanelStateResult = ReturnType<typeof usePanelState>;

let container: HTMLDivElement;
let root: Root;
let current: PanelStateResult | undefined;

function Harness({ onValue }: { onValue: (value: PanelStateResult) => void }) {
  const value = usePanelState({ setShowSettingsModal: () => {} });
  useEffect(() => onValue(value), [onValue, value]);
  return null;
}

const captureValue = (value: PanelStateResult) => {
  current = value;
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness onValue={captureValue} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  current = undefined;
});

describe("usePanelState search options", () => {
  it("exposes conservative defaults", () => {
    expect(current?.state).toMatchObject({
      regexSearch: false,
      wholeWordSearch: false,
      normalizeVariants: false,
      excludeComments: true,
      searchTarget: "all",
      selectionOnly: false,
    });
  });

  it("updates every enhanced search option", () => {
    act(() => {
      current?.handlers.setRegexSearch(true);
      current?.handlers.setWholeWordSearch(true);
      current?.handlers.setNormalizeVariants(true);
      current?.handlers.setExcludeComments(false);
      current?.handlers.setSearchTarget("ruby");
      current?.handlers.setSelectionOnly(true);
    });

    expect(current?.state).toMatchObject({
      regexSearch: true,
      wholeWordSearch: true,
      normalizeVariants: true,
      excludeComments: false,
      searchTarget: "ruby",
      selectionOnly: true,
    });
  });
});
