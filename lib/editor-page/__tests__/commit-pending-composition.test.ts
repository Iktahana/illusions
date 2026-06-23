/**
 * commitPendingComposition の挙動テスト（#1971 IME composition ガード）。
 *
 * - consistency: composition 中でない通常経路では DOMObserver.forceFlush を一切呼ばず、
 *   既存の保存挙動（state.doc を直接シリアライズ）を変えない。
 * - new: composition 中（view.composing もしくは view.input.composing）のとき forceFlush を
 *   呼び、未確定入力のコミットを試みる。例外や欠落 API でも throw せず保存を継続する。
 *
 * EditorView の `composing` は公開プロパティ、`input` / `domObserver` は内部実装のため、
 * テストでは最小のフェイク view を構築して branch を決定的に検証する。
 */

import { describe, it, expect, vi } from "vitest";
import type { EditorView } from "@milkdown/prose/view";
import { commitPendingComposition } from "../commit-pending-composition";

interface FakeViewOptions {
  composing?: boolean;
  inputComposing?: boolean;
  forceFlush?: () => void;
  omitObserver?: boolean;
}

function fakeView(opts: FakeViewOptions = {}): EditorView {
  const view: Record<string, unknown> = {
    composing: opts.composing ?? false,
    input: { composing: opts.inputComposing ?? false },
  };
  if (!opts.omitObserver) {
    view.domObserver = { forceFlush: opts.forceFlush ?? vi.fn() };
  }
  return view as unknown as EditorView;
}

describe("commitPendingComposition — consistency（通常経路は no-op）", () => {
  it("composition 中でなければ false を返し forceFlush を呼ばない", () => {
    const forceFlush = vi.fn();
    const view = fakeView({ composing: false, inputComposing: false, forceFlush });
    expect(commitPendingComposition(view)).toBe(false);
    expect(forceFlush).not.toHaveBeenCalled();
  });

  it("null / undefined view は false を返し throw しない", () => {
    expect(commitPendingComposition(null)).toBe(false);
    expect(commitPendingComposition(undefined)).toBe(false);
  });
});

describe("commitPendingComposition — #1971（変換中はコミットを試みる）", () => {
  it("view.composing=true のとき forceFlush を 1 回呼び true を返す", () => {
    const forceFlush = vi.fn();
    const view = fakeView({ composing: true, forceFlush });
    expect(commitPendingComposition(view)).toBe(true);
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("view.input.composing=true（公開プロパティが false でも）でも検出して forceFlush", () => {
    const forceFlush = vi.fn();
    const view = fakeView({ composing: false, inputComposing: true, forceFlush });
    expect(commitPendingComposition(view)).toBe(true);
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("domObserver が無い環境でも throw せず true を返す", () => {
    const view = fakeView({ composing: true, omitObserver: true });
    expect(() => commitPendingComposition(view)).not.toThrow();
    expect(commitPendingComposition(view)).toBe(true);
  });

  it("forceFlush が throw しても握り潰して true を返す（保存を中断しない）", () => {
    const forceFlush = vi.fn(() => {
      throw new Error("flush failed");
    });
    const view = fakeView({ composing: true, forceFlush });
    expect(() => commitPendingComposition(view)).not.toThrow();
    expect(commitPendingComposition(view)).toBe(true);
  });
});
