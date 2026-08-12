import { describe, it, expect, vi } from "vitest";
import { createHeadingIdFixerPlugin } from "../plugins/heading-id-fixer";

function fakeHeadingNode(id: string, text: string) {
  return {
    type: { name: "heading" },
    attrs: { id, level: 1 },
    descendants(cb: (child: { isText: boolean; text: string }) => void) {
      cb({ isText: true, text });
    },
  };
}

function fakeStateWithHeading(id: string, text: string) {
  const heading = fakeHeadingNode(id, text);
  const setNodeMarkup = vi.fn();

  return {
    doc: {
      descendants(cb: (node: ReturnType<typeof fakeHeadingNode>, pos: number) => void) {
        cb(heading, 1);
      },
    },
    tr: {
      setNodeMarkup,
    },
  };
}

function fakeTransaction(opts: {
  docChanged: boolean;
  composing?: boolean;
  forceReconcile?: boolean;
}) {
  return {
    docChanged: opts.docChanged,
    getMeta(key: string) {
      if (key === "headingIdFixerComposing") return opts.composing === true;
      if (key === "headingIdFixerForceReconcile") return opts.forceReconcile === true;
      return undefined;
    },
  } as unknown;
}

describe("headingIdFixer IME guard", () => {
  it("does not rewrite heading id while composition flag is active", () => {
    const plugin = createHeadingIdFixerPlugin();
    const append = plugin.spec.appendTransaction!;
    const newState = fakeStateWithHeading(encodeURIComponent("見出し"), "見出し追記");

    const result = append(
      [fakeTransaction({ docChanged: true, composing: true }) as never],
      null as never,
      newState as never,
    );

    expect(result).toBeNull();
    expect(newState.tr.setNodeMarkup).not.toHaveBeenCalled();
  });

  it("reconciles heading id after deferred force pass", () => {
    const plugin = createHeadingIdFixerPlugin();
    const append = plugin.spec.appendTransaction!;
    const newState = fakeStateWithHeading(encodeURIComponent("見出し"), "見出し追記");

    const result = append(
      [fakeTransaction({ docChanged: false, forceReconcile: true }) as never],
      null as never,
      newState as never,
    );

    expect(result).toBe(newState.tr);
    expect(newState.tr.setNodeMarkup).toHaveBeenCalledWith(1, undefined, {
      id: encodeURIComponent("見出し追記"),
      level: 1,
    });
  });
});
