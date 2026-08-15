import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { Field } from "../Field";
import { TextInput } from "../TextInput";

describe("Field", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  function render(field: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(field));
  }

  it("associates its description and error with the control", () => {
    render(
      <Field label="名前" description="公開されます" error="入力してください">
        <TextInput />
      </Field>,
    );

    const input = container.querySelector("input");
    const label = container.querySelector("label");
    const describedBy = input?.getAttribute("aria-describedby")?.split(" ") ?? [];

    expect(input?.id).toBeTruthy();
    expect(label?.htmlFor).toBe(input?.id);
    expect(describedBy).toHaveLength(2);
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "公開されます",
      "入力してください",
    ]);
  });

  it("preserves an existing aria-describedby reference", () => {
    render(
      <>
        <span id="external-help">外部ヘルプ</span>
        <Field label="名前" description="説明">
          <input aria-describedby="external-help" />
        </Field>
      </>,
    );

    expect(container.querySelector("input")?.getAttribute("aria-describedby")?.split(" ")[0]).toBe(
      "external-help",
    );
  });
});
