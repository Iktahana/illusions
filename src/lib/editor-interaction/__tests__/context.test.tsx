import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { EditorInteractionProvider, useEditorInteraction } from "../context";

describe("editor interaction context", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  afterEach(() => roots.splice(0).forEach((root) => act(() => root.unmount())));

  it("exposes the handle and external-store snapshot", () => {
    const container = document.createElement("div");
    const snapshot = { ready: false };
    const handle = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      execute: () => ({ status: "unavailable" as const }),
    };
    let observed: unknown;
    function Consumer() {
      const value = useEditorInteraction();
      useEffect(() => {
        observed = value;
      }, [value]);
      return null;
    }
    const root = createRoot(container);
    roots.push(root);
    act(() =>
      root.render(
        <EditorInteractionProvider value={handle as never}>
          <Consumer />
        </EditorInteractionProvider>,
      ),
    );
    expect(observed).toEqual({ handle, snapshot });
  });

  it("rejects consumers outside the provider", () => {
    function Consumer() {
      useEditorInteraction();
      return null;
    }
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    expect(() => act(() => root.render(<Consumer />))).toThrow(/EditorInteractionProvider/);
  });
});
