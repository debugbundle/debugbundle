import { coverageConfigDefaults, defineConfig } from "vitest/config";

const isCoverageShardRun = process.env["VITEST_COVERAGE_SHARD"] === "1";
const coverageReportsDirectory = process.env["VITEST_COVERAGE_DIR"] ?? "coverage";
const coverageConfig = {
  provider: "v8" as const,
  reporter: isCoverageShardRun ? ["json", "json-summary"] : ["text", "html", "json-summary"],
  reportsDirectory: coverageReportsDirectory,
  exclude: [
    ...coverageConfigDefaults.exclude,
    "scripts/check-changed-file-coverage.mjs",
    "apps/cli/bin/debugbundle.js",
    "apps/api/src/api-types.ts",
    "packages/storage/src/types.ts"
  ],
  ...(isCoverageShardRun
    ? { all: false }
    : {
        thresholds: {
          perFile: true,
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80
        }
      })
};

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/apps/public-site/**/*.test.ts", "tests/apps/public-site/**/*.test.tsx", "tests/site/**/*.test.ts", "tests/site/**/*.test.tsx"],
    setupFiles: ["tests/vitest.setup.ts"],
    testTimeout: isCoverageShardRun ? 15000 : 5000,
    coverage: coverageConfig
  }
});
