// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  packagedResourcesDir,
  assertMdiWasmPackaged,
}: {
  packagedResourcesDir: (context: PackagingContext) => string;
  assertMdiWasmPackaged: (context: PackagingContext) => void;
} = require("../embed-quicklook.js");

interface PackagingContext {
  electronPlatformName: string;
  appOutDir: string;
  packager: { appInfo: { productFilename: string } };
}

const temporaryDirectories: string[] = [];

function context(platform: string): PackagingContext {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "illusions-mdi-package-"));
  temporaryDirectories.push(appOutDir);
  return {
    electronPlatformName: platform,
    appOutDir,
    packager: { appInfo: { productFilename: "illusions" } },
  };
}

function wasmPath(
  packagingContext: PackagingContext,
  packaging: "asar" | "directory" | "flattened-directory" = "asar",
): string {
  const runtimePath =
    packaging === "flattened-directory"
      ? ["app", "node_modules"]
      : [packaging === "asar" ? "app.asar.unpacked" : "app", "dist-main", "node_modules"];
  return path.join(
    packagedResourcesDir(packagingContext),
    ...runtimePath,
    "@illusions-lab",
    "mdi-core",
    "dist",
    "mdi_core_bg.wasm",
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("packaged Electron MDI runtime", () => {
  it.each(["darwin", "win32", "linux"])("rejects a missing WASM asset on %s", (platform) => {
    const packagingContext = context(platform);
    expect(() => assertMdiWasmPackaged(packagingContext)).toThrow(
      "Packaged WASM runtime not found",
    );
  });

  it.each(["darwin", "win32", "linux"])("accepts the unpacked WASM asset on %s", (platform) => {
    const packagingContext = context(platform);
    const target = wasmPath(packagingContext);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from("wasm"));

    expect(() => assertMdiWasmPackaged(packagingContext)).not.toThrow();
  });

  it("accepts the unpacked Resources/app layout used by MAS", () => {
    const packagingContext = context("darwin");
    const target = wasmPath(packagingContext, "directory");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from("wasm"));

    expect(() => assertMdiWasmPackaged(packagingContext)).not.toThrow();
  });

  it("accepts the flattened Resources/app/node_modules layout used by MAS", () => {
    const packagingContext = context("darwin");
    const target = wasmPath(packagingContext, "flattened-directory");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from("wasm"));

    expect(() => assertMdiWasmPackaged(packagingContext)).not.toThrow();
  });
});
