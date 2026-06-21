/**
 * Panel-heal invariant (#1875)
 * ----------------------------
 *
 * Dockview removes a panel as soon as its tab close button (or middle-click /
 * context menu "閉じる") is clicked — there is no veto / before-close hook in
 * the dockview API. The removal fires `onDidRemovePanel`, which calls
 * `closeTab(id)`. For a *dirty* editor tab, `closeTab` does NOT remove the tab
 * from the tab list; it only opens the unsaved-changes confirmation dialog
 * (sets `pendingCloseTabId`).
 *
 * That leaves a broken invariant: the tab still exists in `tabs`, but its
 * dockview panel is already gone. If the user then cancels the dialog (or the
 * save is cancelled / fails / is locked / conflicted), the tab stays in `tabs`
 * but no panel is ever recreated — the editor disappears and the unsaved work
 * becomes unreachable.
 *
 * Fix: enforce the invariant "every editor tab in `tabs` has a dockview panel".
 * After each sync pass, recreate panels for editor tabs whose panel is missing.
 * To keep the restored panel in its original split group / tab order, the
 * adapter records each panel's placement just before removal and replays it
 * here.
 *
 * This module holds the pure decision logic so it can be unit-tested without a
 * live dockview instance.
 */

import type { TabId, TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab } from "@/lib/tab-manager/tab-types";

/**
 * Where a panel lived before it was removed, so it can be recreated in the same
 * group and tab position on heal.
 */
export interface PanelPlacement {
  /** dockview group id the panel belonged to. */
  groupId: string;
  /** Index of the panel within its group's tab strip. */
  index: number;
  /** Whether the panel was the active panel when it was removed. */
  wasActive: boolean;
}

/**
 * Compute the editor tabs that exist in `tabs` but have no corresponding
 * dockview panel. These are the tabs whose panels must be recreated to restore
 * the tab ⇆ panel invariant (#1875).
 *
 * Only editor tabs are healed: terminal and diff tabs are removed eagerly by
 * `forceCloseTab` (they never enter the dirty-confirm flow), so a missing
 * terminal/diff panel means the tab is genuinely closing, not pending.
 *
 * @param tabs             Current tab list (source of truth).
 * @param existingPanelIds Set of panel ids currently present in dockview.
 * @returns Editor tabs (in tab order) that need a panel recreated.
 */
export function computeMissingEditorPanels(
  tabs: readonly TabState[],
  existingPanelIds: ReadonlySet<TabId>,
): TabState[] {
  const missing: TabState[] = [];
  for (const tab of tabs) {
    if (!isEditorTab(tab)) continue;
    if (existingPanelIds.has(tab.id)) continue;
    missing.push(tab);
  }
  return missing;
}
