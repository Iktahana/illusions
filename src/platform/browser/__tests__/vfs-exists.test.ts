/**
 * WebVFSFileHandle.exists() error semantics (#1436 / Codex review).
 *
 * Only an actually-missing file (NotFoundError) may report "does not exist".
 * Any other getFile() failure must propagate so read-modify-write callers
 * (PersistedJsonListStore) never mistake a read failure for an absent file
 * and overwrite user data with an empty list.
 */
import { describe, it, expect } from "vitest";
import { WebVFSFileHandle } from "@/platform/browser/vfs";

function makeHandle(getFile: () => Promise<File>): WebVFSFileHandle {
  const native = { kind: "file", name: "f.json", getFile };
  return new WebVFSFileHandle(native as unknown as FileSystemFileHandle, "f.json");
}

describe("WebVFSFileHandle.exists", () => {
  it("returns true when getFile succeeds", async () => {
    const handle = makeHandle(async () => new File(["x"], "f.json"));
    await expect(handle.exists()).resolves.toBe(true);
  });

  it("returns false only for NotFoundError", async () => {
    const handle = makeHandle(async () => {
      throw new DOMException("not found", "NotFoundError");
    });
    await expect(handle.exists()).resolves.toBe(false);
  });

  it("propagates non-NotFound failures (permission, transient I/O)", async () => {
    const denied = makeHandle(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    await expect(denied.exists()).rejects.toThrow("denied");

    const transient = makeHandle(async () => {
      throw new Error("transient I/O failure");
    });
    await expect(transient.exists()).rejects.toThrow("transient I/O failure");
  });
});
