import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // 先用“当前覆盖率基线”卡住回退；随着测试补齐可逐步上调。
      thresholds: {
        lines: 9,
        statements: 9,
        branches: 65,
        functions: 50,
      },
      exclude: [
        "**/node_modules/**",
        "**/.next/**",
        "**/dist/**",
        "**/scripts/**",
        "drizzle.config.ts",
      ],
    },
  },
});
