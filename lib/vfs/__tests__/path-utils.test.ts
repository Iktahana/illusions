import { describe, expect, it } from "vitest";

import { basename, dirname, isAbsolutePath, joinPath } from "@/lib/vfs/path-utils";

describe("lib/vfs/path-utils", () => {
  it("basename handles POSIX, Windows, trailing slash, and UNC paths", () => {
    expect(basename("/Users/me/project/chapter.mdi")).toBe("chapter.mdi");
    expect(basename("C:\\Users\\me\\project\\chapter.mdi")).toBe("chapter.mdi");
    expect(basename("C:\\Users\\me\\project\\\\")).toBe("project");
    expect(basename("\\\\server\\share\\project\\chapter.mdi")).toBe("chapter.mdi");
  });

  it("dirname handles POSIX, Windows, relative root-level, and UNC paths", () => {
    expect(dirname("/Users/me/project/chapter.mdi")).toBe("/Users/me/project");
    expect(dirname("C:\\Users\\me\\project\\chapter.mdi")).toBe("C:/Users/me/project");
    expect(dirname("chapter.mdi")).toBe("/");
    expect(dirname("\\\\server\\share\\project\\chapter.mdi")).toBe("//server/share/project");
  });

  it("isAbsolutePath recognizes POSIX, Windows drive-letter, and UNC absolute paths", () => {
    expect(isAbsolutePath("/Users/me/project")).toBe(true);
    expect(isAbsolutePath("C:\\Users\\me\\project")).toBe(true);
    expect(isAbsolutePath("D:/Users/me/project")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share\\project")).toBe(true);
    expect(isAbsolutePath("project/chapter.mdi")).toBe(false);
  });

  it("joinPath normalizes backslashes while joining", () => {
    expect(joinPath("C:\\Users\\me", "project\\chapter.mdi")).toBe(
      "C:/Users/me/project/chapter.mdi",
    );
  });
});
