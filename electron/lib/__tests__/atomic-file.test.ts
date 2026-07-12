import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { writeUtf8FileAtomically } = require("../atomic-file.js") as {
  writeUtf8FileAtomically: (filePath: string, content: string) => Promise<void>;
};

describe("writeUtf8FileAtomically", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "atomic-file-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it("writes content through a temp file and leaves no temp files behind", async () => {
    const file = path.join(dir, "allowlist.json");

    await writeUtf8FileAtomically(file, '{"version":1}');

    expect(await fsp.readFile(file, "utf8")).toBe('{"version":1}');
    expect(fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("preserves the existing file if the final rename fails", async () => {
    const file = path.join(dir, "allowlist.json");
    await fsp.writeFile(file, '{"version":1,"old":true}', "utf8");

    const renameSpy = vi
      .spyOn(fsp, "rename")
      .mockRejectedValue(Object.assign(new Error("locked"), { code: "EPERM" }));

    await expect(writeUtf8FileAtomically(file, '{"version":1,"new":true}')).rejects.toThrow(
      "locked",
    );

    expect(renameSpy).toHaveBeenCalled();
    expect(await fsp.readFile(file, "utf8")).toBe('{"version":1,"old":true}');
  });
});
