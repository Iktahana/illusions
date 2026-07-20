/**
 * hasUnsavedEditorTabs のエッジケーステスト（#1968 J-3 ダーティガードの判定中核）。
 *
 * beforeunload / popstate のダーティ警告はこの判定で発火する。誤判定は
 * 「未保存なのに警告が出ない＝データ損失」または「保存済みなのに毎回警告＝UX劣化」に
 * 直結するため、境界を固定する。
 */

import { describe, it, expect } from "vitest";
import { hasUnsavedEditorTabs } from "../unsaved-tabs";
import { createNewTab } from "../types";
import type { TabState, EditorTabState, TerminalTabState } from "../tab-types";

function editorTab(isDirty: boolean): EditorTabState {
  return { ...createNewTab("x"), isDirty };
}

function terminalTab(): TerminalTabState {
  // dirty 概念を持たない非編集タブ（最小形）。
  return { tabKind: "terminal", id: "term-1" } as unknown as TerminalTabState;
}

describe("hasUnsavedEditorTabs", () => {
  it("空配列は false", () => {
    expect(hasUnsavedEditorTabs([])).toBe(false);
  });

  it("全タブ clean は false", () => {
    expect(hasUnsavedEditorTabs([editorTab(false), editorTab(false)])).toBe(false);
  });

  it("1つでも dirty な編集タブがあれば true", () => {
    expect(hasUnsavedEditorTabs([editorTab(false), editorTab(true)])).toBe(true);
  });

  it("非編集タブ（ターミナル）は dirty 判定の対象外", () => {
    // ターミナルのみ → false。
    expect(hasUnsavedEditorTabs([terminalTab() as TabState])).toBe(false);
    // ターミナル + clean 編集タブ → false。
    expect(hasUnsavedEditorTabs([terminalTab() as TabState, editorTab(false)])).toBe(false);
    // ターミナル + dirty 編集タブ → true。
    expect(hasUnsavedEditorTabs([terminalTab() as TabState, editorTab(true)])).toBe(true);
  });
});
