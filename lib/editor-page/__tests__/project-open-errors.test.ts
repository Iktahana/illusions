import { describe, it, expect } from "vitest";

import { isProjectNotFoundError } from "../project-open-errors";

describe("isProjectNotFoundError (#1965)", () => {
  it("detects a native fs error with code ENOENT (Web / direct fs)", () => {
    const err = Object.assign(new Error("no such file"), { code: "ENOENT" });
    expect(isProjectNotFoundError(err)).toBe(true);
  });

  it("detects the ENOENT marker in the Electron IPC rejection message", () => {
    // ipcMain.handle strips `.code`; only the prefixed message survives.
    const err = new Error(
      "Error invoking remote method 'vfs:set-root': Error: ENOENT: 指定されたディレクトリが見つかりません",
    );
    expect(isProjectNotFoundError(err)).toBe(true);
  });

  it("does not classify an unrelated set-root failure as not-found", () => {
    // e.g. the NFC mismatch / permission errors must NOT offer recent removal.
    const err = new Error("選択されたディレクトリが要求されたパスと一致しません");
    expect(isProjectNotFoundError(err)).toBe(false);
  });

  it("does not classify a not-a-directory failure as not-found", () => {
    const err = new Error("指定されたパスはディレクトリではありません");
    expect(isProjectNotFoundError(err)).toBe(false);
  });

  it("handles non-error values safely", () => {
    expect(isProjectNotFoundError(null)).toBe(false);
    expect(isProjectNotFoundError(undefined)).toBe(false);
    expect(isProjectNotFoundError("ENOENT")).toBe(false);
    expect(isProjectNotFoundError({ code: "EACCES" })).toBe(false);
  });
});
