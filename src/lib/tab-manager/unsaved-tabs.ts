import { isEditorTab } from "./tab-types";
import type { TabState } from "./tab-types";

/**
 * 開いているタブのうち、未保存（dirty）の編集タブが1つでもあるか判定する。
 *
 * beforeunload / popstate のダーティガードが共通で使う単一の真実
 * （ターミナル等の非編集タブは dirty 概念を持たないため除外する）。
 */
export function hasUnsavedEditorTabs(tabs: readonly TabState[]): boolean {
  return tabs.some((t) => isEditorTab(t) && t.isDirty);
}
