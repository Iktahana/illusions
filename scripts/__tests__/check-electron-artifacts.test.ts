import { afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

import {
  classifyForbiddenArtifact,
  findForbiddenElectronArtifacts,
  normalizeArtifactPath,
} from "../check-electron-artifacts.mjs";

const temporaryDirectories: string[] = [];
const scriptPath = path.resolve(__dirname, "../check-electron-artifacts.mjs");

function createOutputDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "illusions-electron-artifacts-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createArtifact(outputDirectory: string, relativePath: string): void {
  const absolutePath = path.join(outputDirectory, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, "");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron artifact checker", () => {
  it("normalizes Windows and POSIX relative paths", () => {
    expect(normalizeArtifactPath(".\\auth\\callback\\index.html")).toBe("auth/callback/index.html");
    expect(normalizeArtifactPath("./api//nlp/tokenize/index.html")).toBe(
      "api/nlp/tokenize/index.html",
    );
  });

  it.each([
    ["api\\auth\\me\\index.html", "Web authentication route"],
    ["api\\nlp\\batch.html", "Web NLP route"],
    ["auth\\callback.txt", "Web authentication callback route"],
    ["~offline/index.html", "PWA offline route"],
    ["sw.js", "generated service worker"],
    ["sw.js.map", "generated service worker"],
    ["swe-worker-2d894e76.js", "generated service worker"],
    ["swe-worker-2d894e76.js.map", "generated service worker"],
    ["site.webmanifest", "Web app manifest"],
    ["manifest.webmanifest", "Web app manifest"],
    ["nested/APP.WEBMANIFEST", "Web app manifest"],
  ])("classifies forbidden artifact %s", (artifactPath, reason) => {
    expect(classifyForbiddenArtifact(artifactPath)).toBe(reason);
  });

  it.each([
    "api/authentication/index.html",
    "auth/callback-help/index.html",
    "docs/~offline-notes.html",
    "assets/site.webmanifest.txt",
    "assets/sw.js",
    "_next/static/media/linting.worker.123.js",
    "_next/static/media/project-search.worker.456.js",
  ])("does not reject unrelated artifact %s", (artifactPath) => {
    expect(classifyForbiddenArtifact(artifactPath)).toBeNull();
  });

  it("finds forbidden route roots and assets in deterministic path order", () => {
    const outputDirectory = createOutputDirectory();
    for (const artifactPath of [
      "index.html",
      "_next/static/media/linting.worker.123.js",
      "swe-worker-hash.js.map",
      "api/nlp/tokenize/index.html",
      "~offline/index.html",
      "site.webmanifest",
      "nested/manifest.webmanifest",
      "auth/callback/index.html",
      "api/auth/me/index.html",
      "sw.js",
    ]) {
      createArtifact(outputDirectory, artifactPath);
    }

    expect(findForbiddenElectronArtifacts(outputDirectory)).toEqual([
      { relativePath: "api/auth", reason: "Web authentication route" },
      { relativePath: "api/nlp", reason: "Web NLP route" },
      { relativePath: "auth/callback", reason: "Web authentication callback route" },
      { relativePath: "nested/manifest.webmanifest", reason: "Web app manifest" },
      { relativePath: "site.webmanifest", reason: "Web app manifest" },
      { relativePath: "sw.js", reason: "generated service worker" },
      { relativePath: "swe-worker-hash.js.map", reason: "generated service worker" },
      { relativePath: "~offline", reason: "PWA offline route" },
    ]);
  });

  it("accepts a clean Electron static export", () => {
    const outputDirectory = createOutputDirectory();
    createArtifact(outputDirectory, "index.html");
    createArtifact(outputDirectory, "_next/static/chunks/app.js");
    createArtifact(outputDirectory, "_next/static/media/project-search.worker.456.js");

    expect(findForbiddenElectronArtifacts(outputDirectory)).toEqual([]);
  });

  it("rejects symbolic links without following a safe physical target", () => {
    const outputDirectory = createOutputDirectory();
    const safeTarget = path.join(outputDirectory, "safe");
    fs.mkdirSync(safeTarget);
    createArtifact(outputDirectory, "safe/index.html");
    fs.symlinkSync(
      process.platform === "win32" ? safeTarget : "safe",
      path.join(outputDirectory, "auth"),
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(findForbiddenElectronArtifacts(outputDirectory)).toEqual([
      { relativePath: "auth", reason: "symbolic link is unsupported" },
    ]);
  });

  it("fails clearly when the supplied output directory does not exist", () => {
    const parentDirectory = createOutputDirectory();
    const missingDirectory = path.join(parentDirectory, "missing");

    expect(() => findForbiddenElectronArtifacts(missingDirectory)).toThrow(
      `Electron output directory does not exist: ${missingDirectory}`,
    );
  });

  it("returns a failing CLI status and a sorted report for forbidden artifacts", () => {
    const outputDirectory = createOutputDirectory();
    createArtifact(outputDirectory, "sw.js");
    createArtifact(outputDirectory, "auth/callback/index.html");

    const result = spawnSync(process.execPath, [scriptPath, outputDirectory], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      [
        "Electron output contains 2 forbidden Web artifacts:",
        "- auth/callback — Web authentication callback route",
        "- sw.js — generated service worker",
        "",
      ].join("\n"),
    );
  });

  it("runs the CLI when its entry point is a symbolic link", () => {
    const directory = createOutputDirectory();
    const outputDirectory = path.join(directory, "clean-output");
    const linkedScript = path.join(directory, "linked-checker.mjs");
    fs.mkdirSync(outputDirectory);
    fs.symlinkSync(scriptPath, linkedScript, "file");

    const result = spawnSync(process.execPath, [linkedScript, outputDirectory], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`Electron artifacts valid: ${outputDirectory}\n`);
  });
});
