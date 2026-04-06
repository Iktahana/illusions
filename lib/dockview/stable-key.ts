/**
 * Shared stable-key utility for dockview layout persistence and restoration.
 */

import type { TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab, isTerminalTab, isDiffTab } from "@/lib/tab-manager/tab-types";

/**
 * Build a stable, ID-independent key for a tab that survives session restarts.
 * Supports same-file clones via `#N` suffix (e.g. "chapter1.mdi", "chapter1.mdi#1").
 *
 * Key formats:
 *   - First editor tab for a file: file path
 *   - Subsequent clones of same file: "filePath#1", "filePath#2", etc.
 *   - Unsaved editor tab: "unsaved:<tabId>"
 *   - Terminal tab: "terminal:<sessionId>"
 *   - Diff tab: "diff:<sourceTabId>"
 *
 * @param tab - The tab to generate a key for
 * @param occurrences - Mutable map tracking how many times each base path has been seen.
 *   Pass the same map across all tabs in a single serialization pass for correct indexing.
 */
export function stableKeyForTab(tab: TabState, occurrences?: Map<string, number>): string | null {
  if (isEditorTab(tab)) {
    const basePath = tab.file?.path ?? `unsaved:${tab.id}`;
    if (occurrences) {
      const count = occurrences.get(basePath) ?? 0;
      occurrences.set(basePath, count + 1);
      return count === 0 ? basePath : `${basePath}#${count}`;
    }
    return basePath;
  }
  if (isTerminalTab(tab)) {
    return `terminal:${tab.sessionId}`;
  }
  if (isDiffTab(tab)) {
    return `diff:${tab.sourceTabId}`;
  }
  return null;
}
