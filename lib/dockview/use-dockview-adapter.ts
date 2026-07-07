"use client";

/**
 * Dockview adapter — bridges the existing useTabManager with dockview layout.
 *
 * Strategy: Keep the existing useTabManager as the source of truth for tab/file
 * state (it handles file I/O, auto-save, persistence, Electron IPC, etc.).
 * This adapter syncs useTabManager's TabState[] to dockview panels.
 *
 * Phase 1: Single group (visual replacement of TabBar with dockview tabs)
 * Phase 2: Multiple groups (split editor support)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DockviewApi, IDockviewPanel } from "dockview-react";
import type { TabId, TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab, isTerminalTab, isDiffTab } from "@/lib/tab-manager/tab-types";
import { stableKeyForTab } from "./stable-key";
import type { UseTabManagerReturn } from "@/lib/tab-manager/types";
import type {
  EditorPanelParams,
  TerminalPanelParams,
  DiffPanelParams,
  SimplifiedGroupLayout,
} from "./types";
import type { WorkspaceDockviewLayout } from "@/lib/project/project-types";
import { loadDockviewLayout } from "./use-dockview-persistence";
import { computeMissingEditorPanels, type PanelPlacement } from "./panel-heal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDockviewAdapterOptions {
  tabManager: UseTabManagerReturn;
  /** Monotonic counter to force editor remount (e.g. after settings change) */
  editorKey: number;
  /** Monotonic counter to trigger search dialog open in the active editor panel */
  searchOpenTrigger: number;
  /** Initial search term to pre-fill when search dialog opens */
  searchInitialTerm?: string;
  /**
   * Stable per-window key used to scope the saved dockview layout so that
   * multiple windows with different projects do not share the same layout record.
   */
  windowKey?: string | null;
  /**
   * Dockview layout from workspace.json (project mode).
   * When provided, this is used instead of loading from SQLite.
   * Paths are relative to project root and will be converted to absolute.
   */
  projectLayout?: WorkspaceDockviewLayout | null;
}

export interface UseDockviewAdapterReturn {
  /** Call in DockviewReact onReady to register the API */
  handleDockviewReady: (event: { api: DockviewApi }) => void;
  /** The dockview API ref (null until onReady fires) */
  dockviewApi: DockviewApi | null;
  /** Split the active panel in a direction */
  splitEditor: (direction: "right" | "down") => void;
  /** Close the currently active panel's group if it has no other panels */
  closeGroup: () => void;
  /** Pop out the active panel to a new window (Electron: BrowserWindow, Web: window.open) */
  popoutPanel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the `position` option for `addPanel` so a new terminal panel is placed
 * in the correct location immediately, without a post-hoc `moveTo()` call.
 *
 * - If another terminal panel already exists → use `direction: 'within'` to
 *   open the new terminal as a tab in the same group (VS Code behaviour).
 * - Otherwise → use `direction: 'below'` relative to the active (or first)
 *   editor panel to create a bottom split.
 * - If there are no other panels yet → return undefined (panel becomes the
 *   only panel in the layout).
 */
function buildTerminalPanelPosition(
  api: DockviewApi,
  newPanelId: string,
  tabs: TabState[],
): { referencePanel: string; direction: "within" | "below" } | undefined {
  // Look for an existing terminal panel to group with
  for (const panel of api.panels) {
    if (panel.id === newPanelId) continue;
    const tab = tabs.find((t) => t.id === panel.id);
    if (tab && isTerminalTab(tab)) {
      return { referencePanel: panel.id, direction: "within" };
    }
  }

  // No terminal group yet — split below the active (or first) editor panel
  const refPanel = api.activePanel ?? api.panels[0];
  if (refPanel && refPanel.id !== newPanelId) {
    return { referencePanel: refPanel.id, direction: "below" };
  }

  // No other panels — let dockview place the panel freely
  return undefined;
}

// ---------------------------------------------------------------------------
// Layout restoration helper
// ---------------------------------------------------------------------------

/**
 * Apply a saved simplified layout to the current dockview state.
 * Matches panels to saved groups by stable key and uses moveTo() to redistribute.
 * After repositioning, applies saved proportional sizes to the groups.
 *
 * Handles:
 *   - Saved editor tabs (by file path)
 *   - Unsaved editor tabs (by "unsaved:<tabId>" — best-effort match)
 *   - Terminal tabs (by "terminal:<sessionId>")
 *   - Diff tabs (by "diff:<sourceTabId>")
 */
function applySimplifiedLayout(
  api: DockviewApi,
  layout: SimplifiedGroupLayout,
  tabs: TabState[],
): void {
  // Build stable-key → panelId lookup from current tabs (all tab kinds)
  // Uses occurrence tracking to match same-file clones via #N suffix.
  const occurrences = new Map<string, number>();
  const panelIdByKey = new Map<string, string>();
  for (const tab of tabs) {
    const key = stableKeyForTab(tab, occurrences);
    if (key) {
      panelIdByKey.set(key, tab.id);
    }
  }

  // Skip if only one group (default layout, nothing to do)
  if (layout.groups.length <= 1) return;

  // All panels start in the first group (default). We need to move panels
  // from groups[1..n] to new split groups.
  // Strategy: for each subsequent saved group, pick a reference panel from
  // the first group, then move the target panels to create new groups.

  // Track a representative panel per created group to apply sizes afterward
  const groupRepresentatives: Array<IDockviewPanel | null> = [null]; // index 0 = original group

  // The original (default) group holds all panels at this point. Capture it as
  // the stable reference for every split so the new groups are siblings of it.
  const referenceGroup = api.groups[0];

  for (let i = 1; i < layout.groups.length; i++) {
    const savedGroup = layout.groups[i];
    // addGroup() orthogonalizes the root grid for the requested direction, so a
    // saved HORIZONTAL (side-by-side) layout reliably becomes a left-right split.
    // A raw moveTo() from the single default group is orientation-ambiguous —
    // getLocationOrientation([]) returns the *orthogonal* of the root orientation,
    // which made both "right" and "bottom" collapse to a top-bottom split (#1527).
    const direction: "right" | "below" = layout.orientation === "HORIZONTAL" ? "right" : "below";

    // Resolve this group's panels (already added to the default group by the sync effect).
    const panels: IDockviewPanel[] = [];
    for (const savedKey of savedGroup.tabPaths) {
      if (!savedKey) continue;
      const panelId = panelIdByKey.get(savedKey);
      if (!panelId) continue;
      const panel = api.getPanel(panelId);
      if (panel) panels.push(panel);
    }
    if (panels.length === 0) {
      groupRepresentatives.push(null);
      continue;
    }

    let firstPanelInGroup: IDockviewPanel | null = null;
    try {
      // Create a new group in the saved direction, then move this group's panels into it.
      const newGroup = api.addGroup({ direction, referenceGroup });
      for (const panel of panels) {
        panel.api.moveTo({ group: newGroup, position: "center" });
      }
      firstPanelInGroup = panels[0];
    } catch {
      // Reconstruction failed; leave panels in the default group.
    }

    groupRepresentatives.push(firstPanelInGroup);
  }

  // Apply saved proportional sizes (#1075)
  // Use the total container dimension along the split axis to compute absolute pixel sizes.
  if (layout.sizes && layout.sizes.length > 0) {
    const isHorizontal = layout.orientation === "HORIZONTAL";
    // HORIZONTAL (side-by-side) groups vary in width along the split axis; VERTICAL in height.
    const totalPx = isHorizontal ? api.width : api.height;
    if (totalPx > 0) {
      // Find a representative panel for group 0 (the default/first group)
      const firstGroupKey = layout.groups[0]?.tabPaths[0] ?? null;
      const firstGroupPanelId = firstGroupKey ? panelIdByKey.get(firstGroupKey) : null;
      const firstGroupRepresentative = firstGroupPanelId
        ? (api.getPanel(firstGroupPanelId) ?? (api.panels.length > 0 ? api.panels[0] : null))
        : api.panels.length > 0
          ? api.panels[0]
          : null;
      groupRepresentatives[0] = firstGroupRepresentative;

      for (let i = 0; i < layout.groups.length; i++) {
        const proportion = layout.sizes[i];
        if (typeof proportion !== "number" || proportion <= 0) continue;
        const targetPx = Math.round(proportion * totalPx);
        const rep = groupRepresentatives[i];
        if (!rep) continue;
        try {
          rep.group.api.setSize(isHorizontal ? { width: targetPx } : { height: targetPx });
        } catch {
          // setSize may fail if the group is already the right size or no longer exists
        }
      }
    }
  }

  // Restore active tab per group
  for (let i = 0; i < layout.groups.length; i++) {
    const savedGroup = layout.groups[i];
    if (!savedGroup.activeTabPath) continue;
    const activePanelId = panelIdByKey.get(savedGroup.activeTabPath);
    if (!activePanelId) continue;
    const panel = api.getPanel(activePanelId);
    // Guard with isActive: dockview setActive() is NOT idempotent — it
    // detaches/reattaches the panel DOM and resets scroll (#1457).
    if (panel && !panel.api.isActive) {
      try {
        panel.api.setActive();
      } catch {
        // Panel may not be in this group anymore
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDockviewAdapter({
  tabManager,
  editorKey,
  searchOpenTrigger,
  searchInitialTerm,
  windowKey,
  projectLayout,
}: UseDockviewAdapterOptions): UseDockviewAdapterReturn {
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);

  // Track whether we're syncing to prevent loops
  const isSyncingRef = useRef(false);
  // Track previous tab state for diffing
  const prevTabsRef = useRef<TabState[]>([]);
  const prevActiveTabRef = useRef<TabId>("");

  // Layout restoration state
  const savedLayoutRef = useRef<SimplifiedGroupLayout | null>(null);
  const layoutAppliedRef = useRef(false);
  // Counter incremented when the async layout pre-load completes, so
  // the layout-restoration effect re-evaluates without causing the sync
  // effect to re-run (which would duplicate addPanel calls).
  const [layoutReadyTick, setLayoutReadyTick] = useState(0);

  const { tabs, activeTabId, switchTab, closeTab, cloneTab, updateTab, setTabContent } = tabManager;

  // Latest-state refs so the mount-only handleDockviewReady closure (and the
  // dockview event subscriptions it registers) never read stale first-render
  // values (#1567). The previous useCallback([]) captured the first render's
  // tabs/activeTabId, so onReady initialized from stale tabs and
  // onDidActivePanelChange compared against a stale activeTabId forever.
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdLiveRef = useRef<TabId>(activeTabId);
  activeTabIdLiveRef.current = activeTabId;
  const switchTabRef = useRef(switchTab);
  switchTabRef.current = switchTab;
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;
  const panelParamsRef = useRef({ editorKey, searchOpenTrigger, searchInitialTerm });
  panelParamsRef.current = { editorKey, searchOpenTrigger, searchInitialTerm };

  // -- Panel-heal placement tracking (#1875) --------------------------------
  // Dockview has no panel close-veto. Closing a dirty tab removes its panel
  // immediately, but closeTab() keeps the tab (opening the unsaved dialog).
  // To recreate the panel on cancel/failure without losing its split group or
  // tab order, we keep a continuously-refreshed snapshot of every editor
  // panel's placement (lastPlacementRef). When a panel is removed we promote
  // its last-known placement into healPlacementRef so the heal pass can replay
  // it.
  const lastPlacementRef = useRef<Map<TabId, PanelPlacement>>(new Map());
  const healPlacementRef = useRef<Map<TabId, PanelPlacement>>(new Map());
  // Bumped whenever a panel removal leaves a tab without a panel, to trigger
  // the dedicated heal effect (the sync effect alone does not fire because the
  // tab list is unchanged on cancel).
  const [healTick, setHealTick] = useState(0);

  // Refresh the placement snapshot from the live dockview state. Called at the
  // start of each sync pass while panels are still healthy.
  const refreshPlacementSnapshot = useCallback((api: DockviewApi): void => {
    const snapshot = new Map<TabId, PanelPlacement>();
    const activeId = api.activePanel?.id;
    for (const group of api.groups) {
      group.panels.forEach((panel, index) => {
        snapshot.set(panel.id, {
          groupId: group.id,
          index,
          wasActive: panel.id === activeId,
        });
      });
    }
    lastPlacementRef.current = snapshot;
  }, []);

  // Promote a removed panel's last-known placement so the next heal can restore
  // it to the same group / tab position / active state.
  const capturePanelPlacement = useCallback((tabId: TabId): void => {
    const placement = lastPlacementRef.current.get(tabId);
    if (placement) {
      healPlacementRef.current.set(tabId, placement);
    }
  }, []);
  const capturePanelPlacementRef = useRef(capturePanelPlacement);
  capturePanelPlacementRef.current = capturePanelPlacement;

  // Recreate panels for editor tabs that exist in `tabs` but lost their panel
  // (dirty-close cancelled, or save cancelled / failed / locked / conflicted).
  // Reads the latest state via refs so its identity stays stable (#1875).
  const healMissingPanels = useCallback((api: DockviewApi): void => {
    const currentTabs = tabsRef.current;
    const currentActiveTabId = activeTabIdLiveRef.current;
    const {
      editorKey: liveEditorKey,
      searchOpenTrigger: liveSearchOpenTrigger,
      searchInitialTerm: liveSearchInitialTerm,
    } = panelParamsRef.current;

    const existingPanelIds = new Set(api.panels.map((p) => p.id));
    const missingEditorTabs = computeMissingEditorPanels(currentTabs, existingPanelIds);

    for (const tab of missingEditorTabs) {
      if (!isEditorTab(tab)) continue;
      const placement = healPlacementRef.current.get(tab.id);
      // Re-add into the original group at the original index when that group
      // still exists; otherwise let dockview place the panel freely.
      const groupStillExists =
        placement != null && api.groups.some((g) => g.id === placement.groupId);
      let restored = false;
      try {
        api.addPanel<EditorPanelParams>({
          id: tab.id,
          component: "editor",
          title: tab.file?.name ?? `新規ファイル${tab.fileType}`,
          params: {
            bufferId: tab.id,
            isPreview: tab.isPreview,
            filePath: tab.file?.path ?? "",
            fileType: tab.fileType,
            editorKey: liveEditorKey,
            activeTabId: currentActiveTabId,
            searchOpenTrigger: liveSearchOpenTrigger,
            searchInitialTerm: liveSearchInitialTerm,
            pendingExternalContent: tab.pendingExternalContent ?? null,
          },
          ...(groupStillExists && placement
            ? {
                position: {
                  referenceGroup: placement.groupId,
                  direction: "within" as const,
                  index: placement.index,
                },
              }
            : {}),
        });
        restored = true;
      } catch (err) {
        console.warn(`[dockview-adapter] panel heal failed for tab ${tab.id}:`, err);
      }

      // Restore active state when this panel was active before removal. Guard
      // with isActive: dockview setActive() is NOT idempotent (#1457).
      if (restored && placement?.wasActive) {
        const healed = api.getPanel(tab.id);
        if (healed && !healed.api.isActive) {
          try {
            healed.api.setActive();
          } catch {
            // Active sync in the main effect is a backstop.
          }
        }
      }

      // Consume the placement so a later genuine close doesn't resurrect it.
      healPlacementRef.current.delete(tab.id);
    }

    // Drop heal placements for tabs that no longer exist (genuine closes).
    const currentTabIds = new Set(currentTabs.map((t) => t.id));
    for (const tabId of [...healPlacementRef.current.keys()]) {
      if (!currentTabIds.has(tabId)) {
        healPlacementRef.current.delete(tabId);
      }
    }
  }, []);

  // -- onReady callback -----------------------------------------------------

  const handleDockviewReady = useCallback((event: { api: DockviewApi }): void => {
    const api = event.api;
    apiRef.current = api;
    setDockviewApi(api);

    const currentTabs = tabsRef.current;
    const currentActiveTabId = activeTabIdLiveRef.current;
    const { editorKey, searchOpenTrigger, searchInitialTerm } = panelParamsRef.current;

    // Initialize dockview with current tabs, branching by tabKind
    for (const tab of currentTabs) {
      if (isEditorTab(tab)) {
        api.addPanel<EditorPanelParams>({
          id: tab.id,
          component: "editor",
          title: tab.file?.name ?? `新規ファイル${tab.fileType}`,
          params: {
            bufferId: tab.id,
            isPreview: tab.isPreview,
            filePath: tab.file?.path ?? "",
            fileType: tab.fileType,
            editorKey,
            activeTabId: currentActiveTabId,
            searchOpenTrigger,
            searchInitialTerm,
            pendingExternalContent: tab.pendingExternalContent ?? null,
          },
        });
      } else if (isTerminalTab(tab)) {
        const termPosition = buildTerminalPanelPosition(api, tab.id, currentTabs);
        api.addPanel<TerminalPanelParams>({
          id: tab.id,
          component: "terminal",
          title: tab.label,
          params: { sessionId: tab.sessionId },
          ...(termPosition ? { position: termPosition } : {}),
        });
      } else if (isDiffTab(tab)) {
        api.addPanel<DiffPanelParams>({
          id: tab.id,
          component: "diff",
          title: tab.sourceFileName,
          params: { sourceTabId: tab.sourceTabId },
        });
      }
    }

    // Record what was just added so the sync effect diffs against it instead
    // of re-adding every panel (the old code re-added all panels and relied on
    // an empty catch to swallow the duplicate-addPanel errors).
    prevTabsRef.current = currentTabs;
    prevActiveTabRef.current = currentActiveTabId;

    // Set active panel. Guard with isActive: dockview setActive() is NOT
    // idempotent — it detaches/reattaches the panel DOM and resets scroll (#1457).
    const activePanel = api.getPanel(currentActiveTabId);
    if (activePanel && !activePanel.api.isActive) {
      activePanel.api.setActive();
    }

    // Listen for dockview panel activation → update tab manager
    api.onDidActivePanelChange((e) => {
      if (isSyncingRef.current) return;
      // dockview v7: the active-panel change event exposes the panel object
      // (previously the event carried the panel id directly).
      const panelId = e?.panel?.id;
      if (panelId && panelId !== activeTabIdLiveRef.current) {
        isSyncingRef.current = true;
        switchTabRef.current(panelId);
        isSyncingRef.current = false;
      }
    });

    // Listen for dockview panel close → close tab.
    // #1875: dockview has no close-veto, so the panel is already gone here.
    // closeTab() keeps a *dirty* editor tab in the tab list (opening the
    // unsaved dialog) but a clean tab is removed. We record the panel's
    // placement before closing, then bump healTick so the heal effect runs:
    // it recreates a panel only for editor tabs that are STILL in the tab list
    // (i.e. the dirty tab whose dialog is open), restoring the tab ⇆ panel
    // invariant. The tab list itself does not change on a dirty close, so the
    // sync effect would never re-fire — the healTick bump is what drives it.
    api.onDidRemovePanel((e) => {
      if (isSyncingRef.current) return;
      capturePanelPlacementRef.current(e.id);
      isSyncingRef.current = true;
      closeTabRef.current(e.id);
      isSyncingRef.current = false;
      setHealTick((t) => t + 1);
    });
  }, []);

  // -- Reset layout state on project change ----------------------------------
  const prevWindowKeyRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const newKey = windowKey ?? null;
    if (prevWindowKeyRef.current !== undefined && prevWindowKeyRef.current !== newKey) {
      layoutAppliedRef.current = false;
      savedLayoutRef.current = null;
    }
    prevWindowKeyRef.current = newKey;
  }, [windowKey]);

  // -- Pre-load saved layout for restoration --------------------------------
  // In project mode, uses the projectLayout prop (from workspace.json, already
  // loaded). In standalone mode, loads from SQLite via loadDockviewLayout().

  useEffect(() => {
    if (layoutAppliedRef.current) return;

    // Project mode: use workspace.json layout as-is. Both the saved tabPaths and
    // a restored tab's file.path are now VFS-relative (#1532), so the layout's
    // stable keys match the tabs' stable keys WITHOUT converting to absolute.
    // Converting to absolute here (as before #1532) made the keys mismatch, so no
    // panels were found and the split layout collapsed to a single group (#1527).
    if (projectLayout && projectLayout.groups.length > 1) {
      const relativeLayout: SimplifiedGroupLayout = {
        groups: projectLayout.groups.map((g) => ({
          tabPaths: g.tabPaths,
          activeTabPath: g.activeTabPath,
        })),
        orientation: projectLayout.orientation,
        sizes: projectLayout.sizes,
      };
      savedLayoutRef.current = relativeLayout;
      setLayoutReadyTick((t) => t + 1);
      return;
    }

    // Standalone mode: load from SQLite
    let cancelled = false;
    void loadDockviewLayout(windowKey).then((state) => {
      if (cancelled) return;
      if (state?.simplifiedLayout) {
        savedLayoutRef.current = state.simplifiedLayout;
        setLayoutReadyTick((t) => t + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [windowKey, projectLayout]);

  // -- Pending split tracking -----------------------------------------------

  const pendingSplitRef = useRef<{
    direction: "right" | "down";
    referencePanel: string;
  } | null>(null);

  // -- Sync tab state changes → dockview ------------------------------------
  // dockviewApi is included in deps so this effect re-runs when the API
  // becomes available — prevents a race where tabs are restored (from SQLite)
  // before DockviewReact fires onReady, which would leave panels un-created.

  useEffect(() => {
    const api = apiRef.current;
    if (!api || isSyncingRef.current) return;

    isSyncingRef.current = true;

    // #1875: snapshot every live panel's placement before we mutate the layout,
    // so a panel removed between now and the next sync can be recreated in the
    // same group / tab position by the heal pass below.
    refreshPlacementSnapshot(api);

    const prevTabs = prevTabsRef.current;
    const prevTabIds = new Set(prevTabs.map((t) => t.id));
    const currentTabIds = new Set(tabs.map((t) => t.id));

    // Detect newly added tabs (before updating prevTabsRef)
    const newlyAddedTabs = tabs.filter((t) => !prevTabIds.has(t.id));

    // Add new tabs, branching by tabKind
    for (const tab of tabs) {
      if (prevTabIds.has(tab.id)) continue;
      try {
        if (isEditorTab(tab)) {
          api.addPanel<EditorPanelParams>({
            id: tab.id,
            component: "editor",
            title: tab.file?.name ?? `新規ファイル${tab.fileType}`,
            params: {
              bufferId: tab.id,
              isPreview: tab.isPreview,
              filePath: tab.file?.path ?? "",
              fileType: tab.fileType,
              editorKey,
              activeTabId,
              searchOpenTrigger,
              searchInitialTerm,
              pendingExternalContent: tab.pendingExternalContent ?? null,
            },
          });
        } else if (isTerminalTab(tab)) {
          // Add terminal panel with the correct position directly in addPanel,
          // avoiding a post-hoc moveTo() that silently fails.
          const termPosition = buildTerminalPanelPosition(api, tab.id, tabs);
          api.addPanel<TerminalPanelParams>({
            id: tab.id,
            component: "terminal",
            title: tab.label,
            params: { sessionId: tab.sessionId },
            ...(termPosition ? { position: termPosition } : {}),
          });
        } else if (isDiffTab(tab)) {
          api.addPanel<DiffPanelParams>({
            id: tab.id,
            component: "diff",
            title: tab.sourceFileName,
            params: { sourceTabId: tab.sourceTabId },
          });
        }
      } catch (err) {
        // Duplicates are prevented by the prevTabsRef diff (onReady records the
        // panels it added), so a failure here is unexpected — surface it
        // instead of silently swallowing (#1567).
        console.warn(`[dockview-adapter] addPanel failed for tab ${tab.id}:`, err);
      }
    }

    // Remove closed tabs
    for (const prevTab of prevTabs) {
      if (!currentTabIds.has(prevTab.id)) {
        const panel = api.getPanel(prevTab.id);
        if (panel) {
          try {
            api.removePanel(panel);
          } catch {
            // Panel may have been removed by dockview
          }
        }
      }
    }

    // Update titles for changed tabs, branching by tabKind
    for (const tab of tabs) {
      const panel = api.getPanel(tab.id);
      if (!panel) continue;

      if (isEditorTab(tab)) {
        const title = tab.file?.name ?? `新規ファイル${tab.fileType}`;
        if (panel.title !== title) {
          panel.api.setTitle(title);
        }
        panel.api.updateParameters({
          bufferId: tab.id,
          isPreview: tab.isPreview,
          filePath: tab.file?.path ?? "",
          fileType: tab.fileType,
          editorKey,
          activeTabId,
          searchOpenTrigger,
          searchInitialTerm,
          pendingExternalContent: tab.pendingExternalContent ?? null,
        });
      } else if (isTerminalTab(tab)) {
        if (panel.title !== tab.label) {
          panel.api.setTitle(tab.label);
        }
        panel.api.updateParameters({ sessionId: tab.sessionId });
      } else if (isDiffTab(tab)) {
        if (panel.title !== tab.sourceFileName) {
          panel.api.setTitle(tab.sourceFileName);
        }
      }
    }

    // Handle pending split: position the newly created tab in the split location
    const pendingSplit = pendingSplitRef.current;
    if (pendingSplit && newlyAddedTabs.length > 0) {
      const targetTab = newlyAddedTabs[newlyAddedTabs.length - 1];
      const newPanel = api.getPanel(targetTab.id);
      const refPanel = api.getPanel(pendingSplit.referencePanel);

      if (newPanel && refPanel) {
        try {
          newPanel.api.moveTo({
            group: refPanel.group,
            position: pendingSplit.direction === "right" ? "right" : "bottom",
          });
        } catch {
          // Position move failed; panel remains in default group
        }
      }
      pendingSplitRef.current = null;
    }

    // -- Panel-heal pass (#1875): restore the tab ⇆ panel invariant ---------
    healMissingPanels(api);

    // Sync active tab
    if (activeTabId !== prevActiveTabRef.current) {
      const activePanel = api.getPanel(activeTabId);
      if (activePanel && !activePanel.api.isActive) {
        activePanel.api.setActive();
      }
    }

    prevTabsRef.current = tabs;
    prevActiveTabRef.current = activeTabId;
    isSyncingRef.current = false;
  }, [
    tabs,
    activeTabId,
    editorKey,
    searchOpenTrigger,
    searchInitialTerm,
    dockviewApi,
    refreshPlacementSnapshot,
    healMissingPanels,
  ]);

  // -- Panel-heal effect (#1875) --------------------------------------------
  // Driven by healTick (bumped from onDidRemovePanel). A dirty-tab close
  // removes the panel without changing the tab list, so the sync effect above
  // never re-fires — this effect recreates the still-needed panel so cancelling
  // the unsaved dialog (or a cancelled/failed/locked/conflicted save) leaves the
  // editor intact instead of an invisible orphaned tab.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || isSyncingRef.current) return;
    if (healTick === 0) return;

    isSyncingRef.current = true;
    healMissingPanels(api);
    isSyncingRef.current = false;
  }, [healTick, dockviewApi, healMissingPanels]);

  // -- Restore saved layout (separate effect to avoid sync effect interference) --
  // Using a dedicated effect prevents savedLayout changes from re-triggering
  // the sync effect, which would cause duplicate addPanel calls and break rendering.

  const hasTabsForLayout = tabs.length > 0;

  useEffect(() => {
    if (!dockviewApi || !savedLayoutRef.current || layoutAppliedRef.current || !hasTabsForLayout)
      return;

    layoutAppliedRef.current = true;
    try {
      applySimplifiedLayout(dockviewApi, savedLayoutRef.current, tabsRef.current);
    } catch (err) {
      console.warn("[dockview-adapter] Failed to restore layout:", err);
    }
  }, [dockviewApi, layoutReadyTick, hasTabsForLayout]);

  // -- Split editor ---------------------------------------------------------

  const splitEditor = useCallback(
    (direction: "right" | "down") => {
      const api = apiRef.current;
      if (!api) return;

      const activePanel = api.activePanel;
      if (!activePanel) return;

      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (!activeTab) return;

      // Split is only supported for editor tabs
      if (!isEditorTab(activeTab)) return;

      // Duplicate the active tab's content into a new INDEPENDENT draft tab
      // (#1874). The clone is detached from the source file so the two panes
      // cannot silently overwrite each other on save. The new panel will be
      // positioned in the split direction by the sync effect above (via
      // pendingSplitRef). NOTE: this is "duplicate as draft", not a second view
      // of the same document; full single-buffer multi-view is a follow-up.
      cloneTab(activeTab);

      pendingSplitRef.current = {
        direction,
        referencePanel: activePanel.id,
      };
    },
    [tabs, activeTabId, cloneTab],
  );

  // -- Close group ----------------------------------------------------------

  const closeGroup = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const activePanel = api.activePanel;
    if (!activePanel) return;
    const group = activePanel.group;
    if (group.panels.length <= 1) {
      // Close the panel first, then remove the empty group
      activePanel.api.close();
      if (group.panels.length === 0) {
        api.removeGroup(group);
      }
    }
  }, []);

  // -- Popout panel to new window ------------------------------------------

  const popoutPanel = useCallback(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || !isEditorTab(activeTab)) return;

    const electronAPI = window.electronAPI;
    const content = tabManager.content ?? "";
    const fileName = activeTab.file?.name ?? `新規ファイル${activeTab.fileType}`;
    const fileType = activeTab.fileType;

    if (electronAPI?.editor?.popoutPanel) {
      // Electron: pop out to a new BrowserWindow via IPC
      void electronAPI.editor.popoutPanel(activeTab.id, content, fileName, fileType);
    } else {
      // Web fallback: store content in sessionStorage so the popout can read it
      sessionStorage.setItem(`popout-content-${activeTab.id}`, content);
      const params = new URLSearchParams({
        "popout-buffer": activeTab.id,
        fileName,
        fileType,
      });
      window.open(
        `${window.location.origin}?${params.toString()}`,
        "_blank",
        "width=900,height=700",
      );
    }
  }, [tabs, activeTabId, tabManager.content]);

  // -- Cross-window buffer sync (Electron IPC, editor tabs only) -----------

  const { content: tabContent, setContent: tabSetContent } = tabManager;

  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.editor) return;

    const unsubSync = electronAPI.editor.onBufferSync((data) => {
      // Another window changed a buffer — update all matching tabs' state,
      // and apply to the editor view only for the active tab.
      for (const tab of tabs) {
        if (tab.id === data.bufferId && isEditorTab(tab)) {
          // Use setTabContent so isDirty is correctly recomputed for background
          // tabs (updateTab is a shallow merge that skips dirty recomputation,
          // causing popout edits to be silently lost — #1876).
          if (tab.id === activeTabId) {
            // Active tab: drive the editor view (ProseMirror) which will
            // propagate back to tab state via setContent.
            tabSetContent(data.content);
          } else {
            // Background tab: update content and recompute isDirty directly.
            setTabContent(tab.id, data.content);
          }
        }
      }
    });

    const unsubClose = electronAPI.editor.onBufferClose(() => {
      // Another window closed this buffer — no action needed for now
    });

    return () => {
      if (typeof unsubSync === "function") unsubSync();
      if (typeof unsubClose === "function") unsubClose();
    };
  }, [activeTabId, tabs, tabSetContent, updateTab, setTabContent]);

  // Broadcast content changes to other windows (editor tabs only)
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.editor?.sendBufferSync) return;
    if (!activeTabId) return;

    // Only broadcast for editor tabs
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || !isEditorTab(activeTab)) return;

    const content = tabContent ?? "";

    // Debounce to avoid flooding IPC on every keystroke
    const timer = setTimeout(() => {
      electronAPI.editor!.sendBufferSync(activeTabId, content);
    }, 300);

    return () => clearTimeout(timer);
  }, [activeTabId, tabs, tabContent]);

  return {
    handleDockviewReady,
    dockviewApi,
    splitEditor,
    closeGroup,
    popoutPanel,
  };
}
