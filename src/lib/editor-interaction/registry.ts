import type { EditorCommandId } from "./types";

export interface CommandDefinition {
  id: EditorCommandId;
  label: string;
  accelerator?: string;
  nativeRole?: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";
  requiresSelection?: boolean;
  requiresFormatting?: boolean;
}

export const commandRegistry: readonly CommandDefinition[] = [
  { id: "edit.undo", label: "取り消す", accelerator: "CmdOrCtrl+Z", nativeRole: "undo" },
  { id: "edit.redo", label: "やり直す", accelerator: "CmdOrCtrl+Shift+Z", nativeRole: "redo" },
  {
    id: "edit.cut",
    label: "切り取り",
    accelerator: "CmdOrCtrl+X",
    nativeRole: "cut",
    requiresSelection: true,
  },
  {
    id: "edit.copy",
    label: "コピー",
    accelerator: "CmdOrCtrl+C",
    nativeRole: "copy",
    requiresSelection: true,
  },
  { id: "edit.paste", label: "貼り付け", accelerator: "CmdOrCtrl+V", nativeRole: "paste" },
  {
    id: "edit.selectAll",
    label: "すべて選択",
    accelerator: "CmdOrCtrl+A",
    nativeRole: "selectAll",
  },
  { id: "format.strong", label: "太字", requiresSelection: true, requiresFormatting: true },
  { id: "format.emphasis", label: "斜体", requiresSelection: true, requiresFormatting: true },
  {
    id: "format.strikethrough",
    label: "取り消し線",
    requiresSelection: true,
    requiresFormatting: true,
  },
  { id: "format.heading", label: "見出し", requiresSelection: true, requiresFormatting: true },
  { id: "format.blockquote", label: "引用", requiresSelection: true, requiresFormatting: true },
  { id: "format.bulletList", label: "箇条書き", requiresSelection: true, requiresFormatting: true },
  {
    id: "format.orderedList",
    label: "番号付きリスト",
    requiresSelection: true,
    requiresFormatting: true,
  },
  {
    id: "format.inlineCode",
    label: "インラインコード",
    requiresSelection: true,
    requiresFormatting: true,
  },
  { id: "format.clear", label: "書式をクリア", requiresSelection: true, requiresFormatting: true },
  { id: "view.toggleWritingMode", label: "縦書き／横書き" },
];

export const commandById = new Map<EditorCommandId, CommandDefinition>(
  commandRegistry.map((command) => [command.id, command]),
);

export type EditorContextMenuItem =
  { command: EditorCommandId; enabled: boolean } | { separator: true };

export function buildEditorContextMenu(
  availability: Readonly<Record<EditorCommandId, boolean>>,
): EditorContextMenuItem[] {
  return [
    { command: "edit.undo", enabled: availability["edit.undo"] },
    { command: "edit.redo", enabled: availability["edit.redo"] },
    { separator: true },
    { command: "edit.cut", enabled: availability["edit.cut"] },
    { command: "edit.copy", enabled: availability["edit.copy"] },
    { command: "edit.paste", enabled: availability["edit.paste"] },
    { separator: true },
    { command: "edit.selectAll", enabled: availability["edit.selectAll"] },
  ];
}
