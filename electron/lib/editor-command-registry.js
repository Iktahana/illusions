const {
  commands: COMMAND_REGISTRY,
  editorContextMenu: EDITOR_CONTEXT_MENU,
} = require("../../src/lib/editor-interaction/command-registry.json");

const EDITOR_COMMANDS = Object.freeze(
  Object.fromEntries(
    COMMAND_REGISTRY.map(({ id, label, accelerator, nativeRole }) => [
      id,
      nativeRole
        ? { label, accelerator, role: nativeRole, rendererOwned: false }
        : { label, accelerator, rendererOwned: true },
    ]),
  ),
);

function buildEditorContextMenuTemplate(items) {
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 20 ||
    items.length !== EDITOR_CONTEXT_MENU.length
  )
    return null;
  const template = [];
  for (const [index, item] of items.entries()) {
    const expected = EDITOR_CONTEXT_MENU[index];
    if (expected === "separator") {
      if (!(item && item.separator === true && Object.keys(item).length === 1)) return null;
      template.push({ type: "separator" });
      continue;
    }
    if (!item || typeof item.command !== "string" || typeof item.enabled !== "boolean") return null;
    if (item.command !== expected) return null;
    const definition = EDITOR_COMMANDS[item.command];
    if (!definition) return null;
    template.push(
      definition.rendererOwned
        ? {
            label: definition.label,
            accelerator: definition.accelerator,
            enabled: item.enabled,
            command: item.command,
          }
        : {
            label: definition.label,
            accelerator: definition.accelerator,
            role: definition.role,
            enabled: item.enabled,
          },
    );
  }
  return template;
}

module.exports = {
  COMMAND_REGISTRY,
  EDITOR_COMMANDS,
  EDITOR_CONTEXT_MENU,
  buildEditorContextMenuTemplate,
};
