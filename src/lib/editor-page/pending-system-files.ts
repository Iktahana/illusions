export type PendingSystemFile =
  | { type: "project"; projectPath: string; initialFile: string }
  | { type: "standalone"; path: string; content: string };

interface PendingSystemFileHandlers {
  openProject: (projectPath: string, initialFile: string) => void | Promise<void>;
  openStandalone: (path: string, content: string) => void | Promise<void>;
}

/**
 * Deliver files that the operating system supplied before the renderer was
 * ready. Electron drains this queue exactly once, so preserve its ordering.
 */
export async function openPendingSystemFiles(
  files: readonly PendingSystemFile[],
  { openProject, openStandalone }: PendingSystemFileHandlers,
): Promise<void> {
  for (const file of files) {
    if (file.type === "project") {
      await openProject(file.projectPath, file.initialFile);
    } else {
      await openStandalone(file.path, file.content);
    }
  }
}
