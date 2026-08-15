import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ValuePicker from "../ValuePicker";

describe("ValuePicker", () => {
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
  });

  const render = (onChange = vi.fn()) => {
    act(() =>
      root.render(
        <ValuePicker
          value={1.5}
          label="行間"
          options={[1, 1.5, 2]}
          unit="倍"
          onChange={onChange}
        />,
      ),
    );
    return onChange;
  };

  it("formats integer and decimal options and closes after selection", () => {
    const onChange = render();
    act(() => (container.querySelector('button[aria-label="行間"]') as HTMLButtonElement).click());
    expect(container.querySelector('button[aria-label="行間: 1倍"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="行間: 1.5倍"]')).not.toBeNull();

    act(() =>
      (container.querySelector('button[aria-label="行間: 2倍"]') as HTMLButtonElement).click(),
    );
    expect(onChange).toHaveBeenCalledWith(2);
    expect(container.querySelector('button[aria-label="行間: 2倍"]')).toBeNull();
  });

  it("stays open for inside clicks and closes on outside clicks", () => {
    render();
    act(() => (container.querySelector('button[aria-label="行間"]') as HTMLButtonElement).click());
    const menu = container.querySelector(".absolute") as HTMLDivElement;
    act(() => menu.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(container.querySelector('button[aria-label="行間: 1倍"]')).not.toBeNull();

    act(() => document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(container.querySelector('button[aria-label="行間: 1倍"]')).toBeNull();
  });

  it("toggles the picker closed when the trigger is clicked twice", () => {
    render();
    const trigger = container.querySelector('button[aria-label="行間"]') as HTMLButtonElement;
    act(() => trigger.click());
    expect(container.querySelector('button[aria-label="行間: 1倍"]')).not.toBeNull();
    act(() => trigger.click());
    expect(container.querySelector('button[aria-label="行間: 1倍"]')).toBeNull();
  });
});
