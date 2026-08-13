import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    setupFiles: ["./src/test/setup-vitest.ts"],
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    // stale worktree コピー（.claude/worktrees/agent-*）配下の __tests__ が
    // テスト探索に混入して false-RED を起こすのを防ぐ
    exclude: [...configDefaults.exclude, ".claude/worktrees/**", ".worktrees/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
      include: ["src/lib/**/*.ts", "src/components/editor/MilkdownEditor.tsx"],
      exclude: [
        "**/__tests__/**",
        "**/node_modules/**",
        "src/lib/hooks/**",
        "src/lib/menu/**",
        "src/lib/nlp-backend/**",
        "src/lib/editor-page/**",
        "src/lib/dockview/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
