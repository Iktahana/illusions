import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function projectPath(relativePath: string): string {
  return path.join(projectRoot, ...relativePath.split("/"));
}

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

describe("retired Web distribution contract", () => {
  it("keeps Web distribution, PWA runtime, analytics, and generated PWA icons removed", () => {
    const retiredPaths = [
      "vercel.json",
      "src/app/sw.ts",
      "src/app/~offline",
      "src/app/auth/callback",
      "src/components/AnalyticsLoader.tsx",
      "public/robots.txt",
      "public/site.webmanifest",
      "public/icon/illusions-180.png",
      "public/icon/illusions-192.png",
      "public/icon/illusions-512.png",
      "public/icon/illusions-mdi-16.png",
      "public/icon/illusions-mdi-32.png",
      "public/icon/illusions-mdi-180.png",
      "public/icon/illusions-mdi-192.png",
      "public/icon/illusions-mdi-512.png",
    ];

    for (const retiredPath of retiredPaths) {
      expect(fs.existsSync(projectPath(retiredPath)), retiredPath).toBe(false);
    }
  });

  it("keeps retired dependencies and Web-only npm entry points out of package metadata", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const allDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const dependency of [
      "@serwist/next",
      "serwist",
      "@vercel/analytics",
      "@vercel/speed-insights",
    ]) {
      expect(allDependencies, dependency).not.toHaveProperty(dependency);
    }

    expect(packageJson.scripts).not.toHaveProperty("dev:web");
    expect(packageJson.scripts?.postinstall).not.toContain("VERCEL");
    expect(packageJson.scripts?.["build:electron-renderer"]).toContain("ELECTRON_BUILD=1");
    expect(packageJson.scripts?.build).toContain("build:electron-renderer");
  });

  it("preserves Electron static export and worker typing without Web distribution hooks", () => {
    const nextConfig = readProjectFile("next.config.ts");
    const layout = readProjectFile("src/app/layout.tsx");
    const tsconfig = JSON.parse(readProjectFile("tsconfig.json")) as {
      compilerOptions?: { lib?: string[]; types?: string[] };
      exclude?: string[];
    };
    const gitignore = readProjectFile(".gitignore");

    expect(nextConfig).toContain('output: "export"');
    expect(nextConfig).toContain('assetPrefix: "."');
    expect(nextConfig).not.toMatch(/serwist|~offline/i);

    expect(layout).not.toMatch(/AnalyticsLoader|site\.webmanifest|apple-touch-icon|mobile-web-app/);

    expect(tsconfig.compilerOptions?.lib).toContain("webworker");
    expect(tsconfig.compilerOptions?.types ?? []).not.toContain("@serwist/next/typings");
    expect(tsconfig.exclude ?? []).not.toContain("public/sw.js");

    expect(gitignore).not.toMatch(/^\.vercel\/?$/m);
    expect(gitignore).not.toMatch(/^public\/(?:sw|swe-worker)/m);
  });
});
