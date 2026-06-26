/**
 * Stable React key for the editor inside a dockview panel.
 *
 * #1878: this key MUST NOT depend on the panel's active/inactive state. The
 * editor used to be rendered with two different keys —
 *   active:   `tab-${bufferId}-${filePath}-${editorKey}`
 *   inactive: `tab-${bufferId}-${filePath}-inactive`
 * so every tab switch flipped the key, forcing React to unmount + remount the
 * Milkdown/ProseMirror editor and discarding the undo/redo history.
 *
 * The key intentionally includes `editorKey`: that counter is bumped only when a
 * genuine remount is required (display-setting changes, file reload, recovery),
 * NOT on tab navigation. Tab navigation keeps the same key, so the editor
 * instance — and its history — survives the round trip.
 *
 * @param bufferId  Tab/buffer identity.
 * @param filePath  File path bound to the tab (may be empty for new files).
 * @param editorKey Global remount counter; changes only on a true remount.
 */
export function buildEditorPanelKey(bufferId: string, filePath: string, editorKey: number): string {
  return `tab-${bufferId}-${filePath}-${editorKey}`;
}
