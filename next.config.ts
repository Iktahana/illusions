import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";
import packageJson from "./package.json";

// Electron build: static export (API routes are handled via IPC, not HTTP)
const isElectronBuild = process.env.ELECTRON_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isElectronBuild ? { output: "export", assetPrefix: "." } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_LICENSE_TEXT: readFileSync(resolve(__dirname, "LICENSE"), "utf8"),
    NEXT_PUBLIC_TERMS_TEXT: readFileSync(resolve(__dirname, "TERMS.md"), "utf8"),
    // DSN の public key は秘匿情報ではない (Sentry/GlitchTip の設計上、クライアント埋め込み前提)
    NEXT_PUBLIC_ERROR_REPORT_DSN: process.env.ERROR_REPORT_DSN || "",
  },
  images: { unoptimized: true },
  // mdi-core's Node export resolves its colocated wasm with __dirname. Keep
  // that package external during prerender so Turbopack does not rewrite the
  // loader path; browser bundles continue to select the package's web export.
  serverExternalPackages: ["@illusions-lab/mdi-core"],
  trailingSlash: true,
  turbopack: {},
  // Note: After NLP backend migration, kuromoji is only used in:
  // 1. Server-side API routes (Next.js)
  // 2. Electron main process (Node.js)
  // No browser polyfills needed for frontend anymore
};

export default nextConfig;
