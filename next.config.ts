import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { readFileSync } from "fs";
import { resolve } from "path";
import packageJson from "./package.json";

const revision = crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  disable: process.env.NODE_ENV !== "production",
});

// Electron build: static export (API routes are handled via IPC, not HTTP)
const isElectronBuild = process.env.ELECTRON_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isElectronBuild ? { output: "export", assetPrefix: "." } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_LICENSE_TEXT: readFileSync(resolve(__dirname, "LICENSE"), "utf8"),
    NEXT_PUBLIC_TERMS_TEXT: readFileSync(resolve(__dirname, "TERMS.md"), "utf8"),
  },
  images: { unoptimized: true },
  trailingSlash: true,
  turbopack: {},

  // Note: After NLP backend migration, kuromoji is only used in:
  // 1. Server-side API routes (Next.js)
  // 2. Electron main process (Node.js)
  // No browser polyfills needed for frontend anymore
};

export default withSerwist(nextConfig);
