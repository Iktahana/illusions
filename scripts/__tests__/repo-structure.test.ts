import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Path references living in config files (tsconfig, tailwind, electron-builder,
 * workflows-invoked scripts) are invisible to both tsc and the bundlers until
 * something breaks at build or release time. After the src/ layout migration,
 * pin every such reference to the filesystem so a future move fails here first.
 */

const repoRoot = path.resolve(__dirname, "../..");
const exists = (relPath: string) => fs.existsSync(path.join(repoRoot, relPath));

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relPath), "utf8"));
}

describe("repository structure integrity", () => {
  it("tsconfig path aliases point at existing directories", () => {
    const tsconfig = readJson("tsconfig.json") as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    const targets = Object.values(tsconfig.compilerOptions.paths).flat();
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const base = target.replace(/\/?\*$/, "");
      expect(exists(base), `tsconfig path target missing: ${base}`).toBe(true);
    }
  });

  it("tailwind content globs are rooted in existing directories", () => {
    const source = fs.readFileSync(path.join(repoRoot, "tailwind.config.ts"), "utf8");
    const globs = [...source.matchAll(/"(\.\/[^"]+)"/g)].map((match) => match[1]);
    expect(globs.length).toBeGreaterThan(0);
    for (const glob of globs) {
      const base = glob.split("**")[0].replace(/\/$/, "");
      expect(exists(base), `tailwind content base missing: ${base}`).toBe(true);
    }
  });

  it("electron-builder resources referenced from package.json exist", () => {
    const pkg = readJson("package.json") as {
      build: {
        icon: string;
        afterPack: string;
        afterSign: string;
        mac: { icon: string; entitlements: string; entitlementsInherit: string };
        mas: { entitlements: string; entitlementsInherit: string };
        win: { icon: string };
      };
    };
    const build = pkg.build;
    // mas.provisioningProfile is decoded from CI secrets and intentionally
    // absent from the repository — do not add it here.
    const resources = [
      build.icon,
      build.afterPack,
      build.afterSign,
      build.mac.icon,
      build.mac.entitlements,
      build.mac.entitlementsInherit,
      build.mas.entitlements,
      build.mas.entitlementsInherit,
      build.win.icon,
    ];
    for (const resource of resources) {
      expect(exists(resource), `electron-builder resource missing: ${resource}`).toBe(true);
    }
  });

  it("npm script entry points and hook scripts exist", () => {
    const pkg = readJson("package.json") as { scripts: Record<string, string> };
    const referenced = new Set<string>();
    for (const command of Object.values(pkg.scripts)) {
      for (const match of command.matchAll(/scripts\/[\w./-]+/g)) referenced.add(match[0]);
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const script of referenced) {
      expect(exists(script), `npm script references missing file: ${script}`).toBe(true);
    }
  });

  it("build-quicklook.sh source directory exists under native/", () => {
    const source = fs.readFileSync(path.join(repoRoot, "scripts/build-quicklook.sh"), "utf8");
    const match = source.match(/SRC_DIR="\$\{ROOT_DIR\}\/([^"]+)"/);
    expect(match).not.toBeNull();
    expect(exists(match![1]), `quicklook source missing: ${match![1]}`).toBe(true);
  });

  it("release-notes template lives under assets/store/", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "scripts/generate-release-notes.mjs"),
      "utf8",
    );
    const templates = [...source.matchAll(/"(assets\/store\/[^"]+template[^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(exists(template), `release-notes template missing: ${template}`).toBe(true);
    }
  });

  it("script-internal path.join/resolve targets exist", () => {
    // These are built from split arguments ("app", "local-fonts.css"), so the
    // literal-path sweeps that catch "app/..." strings miss them — the exact
    // gap that broke the first post-src/ beta build.
    for (const target of ["src/app/local-fonts.css", "assets/store/microsoft/ja-JP"]) {
      expect(exists(target), `script target missing: ${target}`).toBe(true);
    }
  });

  it("vitest setup file exists", () => {
    const source = fs.readFileSync(path.join(repoRoot, "vitest.config.ts"), "utf8");
    const match = source.match(/setupFiles:\s*\["([^"]+)"\]/);
    expect(match).not.toBeNull();
    expect(exists(match![1]), `vitest setup file missing: ${match![1]}`).toBe(true);
  });

  it("legacy root source directories stay retired", () => {
    // These moved into src/ (or assets/) in the 2026-07 restructure. If one
    // reappears at the root, an old branch was merged without rebasing onto
    // the new layout and its files are invisible to the build.
    for (const legacy of [
      "app",
      "components",
      "contexts",
      "lib",
      "platform",
      "shared",
      "store",
      "test",
      "types",
      "quicklook",
    ]) {
      expect(exists(legacy), `legacy root directory reappeared: ${legacy}/`).toBe(false);
    }
  });
});
