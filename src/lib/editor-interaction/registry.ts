import commandRegistryData from "./command-registry.json";
import type { EditorCommandId } from "./types";

export interface CommandDefinition {
  id: EditorCommandId;
  label: string;
  accelerator?: string;
  nativeRole?: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";
  requiresSelection?: boolean;
  requiresFormatting?: boolean;
}

const { commands, editorContextMenu } = commandRegistryData as {
  commands: CommandDefinition[];
  editorContextMenu: Array<EditorCommandId | "separator">;
};

export const commandRegistry: readonly CommandDefinition[] = commands;

export const commandById = new Map<EditorCommandId, CommandDefinition>(
  commandRegistry.map((command) => [command.id, command]),
);

export type EditorContextMenuItem =
  { command: EditorCommandId; enabled: boolean } | { separator: true };

export function buildEditorContextMenu(
  availability: Readonly<Record<EditorCommandId, boolean>>,
): EditorContextMenuItem[] {
  return editorContextMenu.map((item) =>
    item === "separator" ? { separator: true } : { command: item, enabled: availability[item] },
  );
}
