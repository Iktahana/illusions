const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_BASE_NAME_CODE_POINTS = 120;

/** Build a cross-platform-safe basename shared by native export dialogs. */
export function safeExportBaseName(title: unknown): string {
  const rawTitle = typeof title === "string" ? title : "";
  const withoutDocumentExtension = rawTitle.replace(/\.(?:mdi|md|txt)$/i, "");
  let baseName = withoutDocumentExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[ .]+$/g, "")
    .trim();

  baseName = Array.from(baseName).slice(0, MAX_BASE_NAME_CODE_POINTS).join("");
  if (!baseName || baseName === "." || baseName === "..") baseName = "untitled";
  if (WINDOWS_RESERVED_NAME.test(baseName)) baseName += "_";
  return baseName;
}
