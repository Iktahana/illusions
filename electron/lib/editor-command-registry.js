const EDITOR_COMMANDS = Object.freeze({
  "edit.undo": { label: "取り消す", accelerator: "CmdOrCtrl+Z", role: "undo" },
  "edit.redo": { label: "やり直す", accelerator: "CmdOrCtrl+Shift+Z", role: "redo" },
  "edit.cut": { label: "切り取り", accelerator: "CmdOrCtrl+X", role: "cut" },
  "edit.copy": { label: "コピー", accelerator: "CmdOrCtrl+C", role: "copy" },
  "edit.paste": { label: "貼り付け", accelerator: "CmdOrCtrl+V", role: "paste" },
  "edit.selectAll": { label: "すべて選択", accelerator: "CmdOrCtrl+A", role: "selectAll" },
});

function buildEditorContextMenuTemplate(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) return null;
  const template = [];
  for (const item of items) {
    if (item && item.separator === true && Object.keys(item).length === 1) {
      template.push({ type: "separator" });
      continue;
    }
    if (!item || typeof item.command !== "string" || typeof item.enabled !== "boolean") return null;
    const definition = EDITOR_COMMANDS[item.command];
    if (!definition) return null;
    template.push({ ...definition, enabled: item.enabled });
  }
  return template;
}

module.exports = { EDITOR_COMMANDS, buildEditorContextMenuTemplate };
