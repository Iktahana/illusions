import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      thresholds: {
        lines: 5,
        functions: 5,
        branches: 3,
        statements: 5,
      },
      include: ["lib/**/*.ts"],
      exclude: [
        "**/__tests__/**",
        "**/node_modules/**",
        "lib/hooks/**",
        "lib/menu/**",
        "lib/nlp-backend/**",
        "lib/editor-page/**",
        "lib/dockview/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
