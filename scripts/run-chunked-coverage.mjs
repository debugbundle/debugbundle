#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCoverageMap } = require("istanbul-lib-coverage");

const ROOT = process.cwd();
const TESTS_ROOT = path.join(ROOT, "tests");
const COVERAGE_ROOT = path.join(ROOT, "coverage");
const SHARD_ROOT = path.join(COVERAGE_ROOT, "shards");
const DEFAULT_MAX_FILES_PER_SHARD = 10;
const EXCLUDED_TEST_DIRECTORIES = new Set([
  path.join(TESTS_ROOT, "apps", "public-site"),
  path.join(TESTS_ROOT, "site")
]);

function toPosixPath(value) {
  return value.replaceAll(path.sep, "/");
}

function collectTestFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (absolutePath === path.join(TESTS_ROOT, "integration")) {
        continue;
      }

      if (EXCLUDED_TEST_DIRECTORIES.has(absolutePath)) {
        continue;
      }

      files.push(...collectTestFiles(absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      continue;
    }

    files.push(toPosixPath(path.relative(ROOT, absolutePath)));
  }

  return files;
}

function buildShardGroups(files) {
  const grouped = new Map();

  for (const file of files) {
    const segments = file.split("/");
    const groupKey = segments[1] === "apps" || segments[1] === "packages"
      ? `${segments[0]}/${segments[1]}/${segments[2]}`
      : `${segments[0]}/${segments[1]}`;
    const existing = grouped.get(groupKey) ?? [];
    existing.push(file);
    grouped.set(groupKey, existing);
  }

  const shards = [];
  for (const groupKey of [...grouped.keys()].sort()) {
    const groupFiles = grouped.get(groupKey).sort();
    const maxFilesPerShard = groupKey.startsWith("tests/apps/mcp/") || groupKey.startsWith("tests/apps/web/")
      ? 4
      : groupKey.startsWith("tests/apps/public-site/") || groupKey.startsWith("site/")
        ? 6
        : DEFAULT_MAX_FILES_PER_SHARD;
    for (let index = 0; index < groupFiles.length; index += maxFilesPerShard) {
      const shardFiles = groupFiles.slice(index, index + maxFilesPerShard);
      const shardIndex = Math.floor(index / maxFilesPerShard) + 1;
      const shardName = `${groupKey.replaceAll("/", "-")}-${shardIndex}`;
      shards.push({ name: shardName, files: shardFiles });
    }
  }

  return shards;
}

function runShard(shard, shardNumber, shardCount) {
  const shardCoverageDir = path.join(SHARD_ROOT, shard.name);
  rmSync(shardCoverageDir, { recursive: true, force: true });
  mkdirSync(shardCoverageDir, { recursive: true });

  console.log(`coverage shard ${shardNumber}/${shardCount}: ${shard.name} (${shard.files.length} files)`);

  execFileSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--coverage",
      "--reporter=dot",
      "--pool=threads",
      "--maxWorkers=1",
      "--no-file-parallelism",
      ...shard.files
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=6144",
        VITEST_COVERAGE_SHARD: "1",
        VITEST_COVERAGE_DIR: shardCoverageDir
      }
    }
  );

  const coverageFinalPath = path.join(shardCoverageDir, "coverage-final.json");
  if (!existsSync(coverageFinalPath)) {
    throw new Error(`coverage shard missing coverage-final.json: ${coverageFinalPath}`);
  }

  return coverageFinalPath;
}

function buildMergedCoverage(coverageFiles) {
  const coverageMap = createCoverageMap({});
  for (const coverageFile of coverageFiles) {
    const raw = readFileSync(coverageFile, "utf8");
    coverageMap.merge(JSON.parse(raw));
  }

  return coverageMap;
}

function writeMergedCoverageArtifacts(coverageMap) {
  mkdirSync(COVERAGE_ROOT, { recursive: true });

  writeFileSync(path.join(COVERAGE_ROOT, "coverage-final.json"), JSON.stringify(coverageMap.toJSON()), "utf8");

  const summary = {
    total: coverageMap.getCoverageSummary().toJSON()
  };

  for (const file of coverageMap.files().sort()) {
    const relativeFile = toPosixPath(path.relative(ROOT, file));
    const fileSummary = coverageMap.fileCoverageFor(file).toSummary().toJSON();
    summary[relativeFile] = fileSummary;
  }

  writeFileSync(path.join(COVERAGE_ROOT, "coverage-summary.json"), JSON.stringify(summary, null, 2), "utf8");

  const total = summary.total;
  console.log(
    `merged coverage: lines=${total.lines.pct.toFixed(2)}% functions=${total.functions.pct.toFixed(2)}% branches=${total.branches.pct.toFixed(2)}% statements=${total.statements.pct.toFixed(2)}%`
  );
}

function main() {
  rmSync(COVERAGE_ROOT, { recursive: true, force: true });

  const files = collectTestFiles(TESTS_ROOT).sort();
  const shards = buildShardGroups(files);
  const coverageFiles = shards.map((shard, index) => runShard(shard, index + 1, shards.length));
  const mergedCoverage = buildMergedCoverage(coverageFiles);
  writeMergedCoverageArtifacts(mergedCoverage);

  execFileSync("node", [path.join("scripts", "check-changed-file-coverage.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
  });
}

main();