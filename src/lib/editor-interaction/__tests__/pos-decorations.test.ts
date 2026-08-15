import { describe, expect, it, vi } from "vitest";

const mockCore = vi.hoisted(() => ({
  editorStateCtx: Symbol("editorStateCtx"),
  editorViewCtx: Symbol("editorViewCtx"),
}));

const mockPm = vi.hoisted(() => {
  class PluginKey<T = unknown> {
    constructor(public readonly name: string) {}
    getState(state: Record<string, T | undefined>): T | undefined {
      return state[this.name];
    }
  }

  class Plugin<T = unknown> {
    constructor(public readonly spec: T) {}
  }

  const empty = { kind: "empty" };
  const DecorationSet = {
    empty,
    create: vi.fn((doc: unknown, decorations: unknown[]) => ({
      kind: "created",
      doc,
      decorations,
      map: vi.fn((mapping: unknown, nextDoc: unknown) => ({
        kind: "mapped",
        mapping,
        doc: nextDoc,
      })),
    })),
  };

  const Decoration = {
    inline: vi.fn((from: number, to: number, attrs: Record<string, string>) => ({
      from,
      to,
      attrs,
    })),
  };

  return { Decoration, DecorationSet, Plugin, PluginKey };
});

vi.mock("@milkdown/core", () => mockCore);
vi.mock("@milkdown/prose/state", () => mockPm);
vi.mock("@milkdown/prose/view", () => mockPm);
vi.mock("@milkdown/utils", () => ({
  $prose: (factory: () => unknown) => factory(),
}));

describe("pos decorations", async () => {
  const posDecorationModule = await import("../pos-decorations");
  const { posDecorations, setPosDecorations, clearPosDecorations } = posDecorationModule;
  const plugin = posDecorations as unknown as { spec: any };

  it("replaces, preserves, and maps decoration state", () => {
    const initial = plugin.spec.state.init();
    expect(initial).toEqual({ decorations: mockPm.DecorationSet.empty });

    const replacement = { decorations: { kind: "replacement" } };
    expect(
      plugin.spec.state.apply({ getMeta: () => replacement, docChanged: false }, initial),
    ).toBe(replacement);

    expect(plugin.spec.state.apply({ getMeta: () => undefined, docChanged: false }, initial)).toBe(
      initial,
    );

    const mapped = plugin.spec.state.apply(
      { getMeta: () => undefined, docChanged: true, mapping: { step: 1 }, doc: { id: "next-doc" } },
      {
        decorations: {
          map: vi.fn(() => ({ kind: "mapped-decoration-set" })),
        },
      },
    );
    expect(mapped).toEqual({ decorations: { kind: "mapped-decoration-set" } });
  });

  it("exposes decorations through plugin props", () => {
    expect(
      plugin.spec.props.decorations({
        posHighlightDecorations: { decorations: { kind: "visible" } },
      }),
    ).toEqual({ kind: "visible" });
    expect(plugin.spec.props.decorations({})).toBeNull();
  });

  it("dispatches inline decorations with POS metadata", () => {
    const setMeta = vi.fn((_key, value) => value);
    const dispatch = vi.fn();
    setPosDecorations([
      { from: 1, to: 3, category: "名詞", color: "#4A90E2" },
      { from: 4, to: 6, category: "動詞", color: "#27AE60" },
    ])({
      get: (token: symbol) =>
        token === mockCore.editorViewCtx
          ? {
              state: {
                doc: { id: "doc" },
                tr: { setMeta },
              },
              dispatch,
            }
          : null,
    } as never);

    expect(mockPm.Decoration.inline).toHaveBeenNthCalledWith(1, 1, 3, {
      class: "pos-highlight",
      style: "color: #4A90E2;",
      "data-pos-highlight-category": "名詞",
    });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(setMeta).toHaveBeenCalledOnce();
  });

  it("clears only when decorations are currently present", () => {
    const dispatch = vi.fn();
    const setMeta = vi.fn((_key, value) => value);
    const ctx = {
      get: (token: symbol) => {
        if (token === mockCore.editorStateCtx) return {};
        if (token === mockCore.editorViewCtx)
          return {
            state: {
              tr: { setMeta },
            },
            dispatch,
          };
        return null;
      },
    };

    clearPosDecorations(ctx as never);
    expect(dispatch).not.toHaveBeenCalled();

    clearPosDecorations({
      get: (token: symbol) =>
        token === mockCore.editorStateCtx
          ? { posHighlightDecorations: { decorations: mockPm.DecorationSet.empty } }
          : ctx.get(token),
    } as never);
    expect(dispatch).not.toHaveBeenCalled();

    clearPosDecorations({
      get: (token: symbol) =>
        token === mockCore.editorStateCtx
          ? { posHighlightDecorations: { decorations: { kind: "active" } } }
          : ctx.get(token),
    } as never);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(setMeta).toHaveBeenCalledWith(
      expect.objectContaining({ name: "posHighlightDecorations" }),
      { decorations: mockPm.DecorationSet.empty },
    );
  });
});
