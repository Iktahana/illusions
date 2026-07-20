import { describe, expect, it, vi } from "vitest";

import { openPendingSystemFiles } from "../pending-system-files";

describe("openPendingSystemFiles", () => {
  it("opens queued project and standalone files in OS delivery order", async () => {
    const openProject = vi.fn().mockResolvedValue(undefined);
    const openStandalone = vi.fn().mockResolvedValue(undefined);

    await openPendingSystemFiles(
      [
        { type: "project", projectPath: "/novel", initialFile: "chapter.mdi" },
        { type: "standalone", path: "/notes.mdi", content: "本文" },
      ],
      { openProject, openStandalone },
    );

    expect(openProject).toHaveBeenCalledWith("/novel", "chapter.mdi");
    expect(openStandalone).toHaveBeenCalledWith("/notes.mdi", "本文");
    expect(openProject.mock.invocationCallOrder[0]).toBeLessThan(
      openStandalone.mock.invocationCallOrder[0],
    );
  });
});
