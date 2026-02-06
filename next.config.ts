import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  
  // Note: After NLP backend migration, kuromoji is only used in:
  // 1. Server-side API routes (Next.js)
  // 2. Electron main process (Node.js)
  // No browser polyfills needed for frontend anymore
};

export default nextConfig;
