import { getDefaultEditorSettings, getDefaultWorkspaceState } from "@/lib/project/project-types";

import type { ProjectConfig, SupportedFileExtension } from "@/lib/project/project-types";
import type { VFSDirectoryHandle } from "@/lib/vfs/types";

/** A directory handle that works for both VFS and Web File System Access API */
export type AnyDirectoryHandle = VFSDirectoryHandle | FileSystemDirectoryHandle;

/** Read text from a file handle (VFS or Web) */
export async function readFileHandle(handle: {
  read?: () => Promise<string>;
  getFile?: () => Promise<File>;
}): Promise<string> {
  if (typeof handle.read === "function") {
    return handle.read();
  }
  const file = await handle.getFile!();
  return file.text();
}

/**
 * Read or auto-create .illusions/project.json.
 * If .illusions/ or project.json doesn't exist, creates them with sensible defaults.
 */
export async function ensureProjectJson(
  rootDirHandle: AnyDirectoryHandle,
  mainFile?: string,
): Promise<{ metadata: ProjectConfig; illusionsDir: AnyDirectoryHandle }> {
  const illusionsDir = await rootDirHandle.getDirectoryHandle(".illusions", { create: true });

  // Use { create: true } so getFileHandle never throws ENOENT on the IPC layer.
  // If the file was just created it will be empty → treat as "does not exist".
  const projectJsonHandle = await illusionsDir.getFileHandle("project.json", { create: true });
  let metadataText: string | undefined;
  try {
    const raw = await readFileHandle(projectJsonHandle as Parameters<typeof readFileHandle>[0]);
    if (raw.trim()) metadataText = raw;
  } catch {
    // read failed — treat as missing
  }

  if (metadataText) {
    return { metadata: JSON.parse(metadataText) as ProjectConfig, illusionsDir };
  }

  // Auto-create project.json with defaults
  const dirName = rootDirHandle.name || "Untitled";
  const ext = (mainFile?.match(/\.\w+$/)?.[0] ?? ".mdi") as SupportedFileExtension;
  const metadata: ProjectConfig = {
    version: "1.0.0",
    projectId: crypto.randomUUID(),
    name: dirName,
    mainFile: mainFile ?? `${dirName}${ext}`,
    mainFileExtension: ext,
    createdAt: Date.now(),
    lastModified: Date.now(),
    editorSettings: getDefaultEditorSettings(ext),
  };

  // projectJsonHandle already exists (created empty above) — write defaults into it
  if (
    "write" in projectJsonHandle &&
    typeof (projectJsonHandle as { write: unknown }).write === "function"
  ) {
    await (projectJsonHandle as { write: (s: string) => Promise<void> }).write(
      JSON.stringify(metadata, null, 2),
    );
  } else {
    const writable = await (projectJsonHandle as FileSystemFileHandle).createWritable();
    await writable.write(JSON.stringify(metadata, null, 2));
    await writable.close();
  }

  // Also create workspace.json
  try {
    const wsHandle = await illusionsDir.getFileHandle("workspace.json", { create: true });
    const wsData = JSON.stringify(getDefaultWorkspaceState(), null, 2);
    if ("write" in wsHandle && typeof (wsHandle as { write: unknown }).write === "function") {
      await (wsHandle as { write: (s: string) => Promise<void> }).write(wsData);
    } else {
      const writable = await (wsHandle as FileSystemFileHandle).createWritable();
      await writable.write(wsData);
      await writable.close();
    }
  } catch {
    // workspace.json creation is best-effort
  }

  console.info("[Project] Auto-created .illusions/project.json for:", dirName);
  return { metadata, illusionsDir };
}
