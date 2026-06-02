#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_THRESHOLD = 80;
const METRICS = ["statements", "lines", "functions", "branches"];

function run(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function canUseGit() {
  try {
    run("git --version");
    return true;
  } catch {
    return false;
  }
}

function normalizeToWorkspaceRelative(filePath) {
  const workspace = process.cwd();
  const normalized = filePath.replaceAll("\\", "/");
  const workspaceNormalized = workspace.replaceAll("\\", "/");

  if (normalized.startsWith(`${workspaceNormalized}/`)) {
    return normalized.slice(workspaceNormalized.length + 1);
  }

  if (normalized.startsWith("/workspace/")) {
    return normalized.slice("/workspace/".length);
  }

  if (normalized.startsWith("./")) {
    return normalized.slice(2);
  }

  return normalized;
}

function getChangedFiles() {
  if (!canUseGit()) {
    console.warn("coverage:changed: git unavailable; skipping changed-file coverage check");
    return [];
  }

  const baseSha = process.env.BASE_SHA;
  const headSha = process.env.HEAD_SHA || "HEAD";

  if (baseSha) {
    let diffRange = "HEAD~1...HEAD";
    try {
      run(`git rev-parse --verify ${baseSha}`);
      diffRange = `${baseSha}...${headSha}`;
    } catch {
      console.warn(`coverage:changed: unable to verify BASE_SHA=${baseSha}; falling back to ${diffRange}`);
    }

    const output = run(`git diff --name-only --diff-filter=ACMR ${diffRange}`);
    if (!output) {
      return [];
    }

    return output
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const trackedOutput = run("git diff --name-only --diff-filter=ACMR HEAD");
  const untrackedOutput = run("git ls-files --others --exclude-standard");

  return [...new Set([
    ...trackedOutput.split("\n"),
    ...untrackedOutput.split("\n")
  ].map((value) => value.trim()).filter(Boolean))];
}

function quotePath(filePath) {
  return `'${filePath.replaceAll("'", "'\\''")}'`;
}

function getDiffRange() {
  const baseSha = process.env.BASE_SHA;
  const headSha = process.env.HEAD_SHA || "HEAD";

  if (baseSha) {
    try {
      run(`git rev-parse --verify ${baseSha}`);
      return `${baseSha}...${headSha}`;
    } catch {
      return "HEAD~1...HEAD";
    }
  }

  return "HEAD";
}

function getChangedAddedLines(filePath) {
  if (!canUseGit()) {
    return null;
  }

  const quotedPath = quotePath(filePath);
  let diffOutput = "";

  try {
    diffOutput = run(`git diff --unified=0 --diff-filter=ACMR ${getDiffRange()} -- ${quotedPath}`);
  } catch {
    diffOutput = "";
  }

  if (!diffOutput) {
    try {
      const untracked = run("git ls-files --others --exclude-standard");
      if (!untracked.split("\n").includes(filePath)) {
        return new Set();
      }
    } catch {
      return new Set();
    }

    const absolutePath = path.join(process.cwd(), filePath);
    if (!existsSync(absolutePath)) {
      return new Set();
    }

    const lineCount = readFileSync(absolutePath, "utf8").split("\n").length;
    return new Set(Array.from({ length: lineCount }, (_, index) => index + 1));
  }

  const addedLines = new Set();
  let newLine = 0;

  for (const line of diffOutput.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk !== null) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }

    if (line.startsWith("+")) {
      addedLines.add(newLine);
      newLine += 1;
      continue;
    }

    if (!line.startsWith("-")) {
      newLine += 1;
    }
  }

  return addedLines;
}

function isSourceCandidate(filePath) {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) {
    return false;
  }

  if (filePath.startsWith("tests/")) {
    return false;
  }

  if (/\.test\./.test(filePath)) {
    return false;
  }

  if (filePath.startsWith(".github/")) {
    return false;
  }

  if (/^apps\/[^/]+\/src\//.test(filePath)) {
    return true;
  }

  if (/^packages\/[^/]+\/src\//.test(filePath)) {
    return true;
  }

  // Keep schema bootstrap in scope as executable product behavior.
  if (filePath === "scripts/bootstrap-storage.ts") {
    return true;
  }

  return false;
}

function loadCoverageSummary() {
  const summaryPath = path.join(process.cwd(), "coverage", "coverage-summary.json");
  if (!existsSync(summaryPath)) {
    throw new Error("coverage summary missing at coverage/coverage-summary.json; run tests with coverage before coverage:changed");
  }

  const raw = readFileSync(summaryPath, "utf8");
  const parsed = JSON.parse(raw);
  const map = new Map();

  for (const [key, value] of Object.entries(parsed)) {
    if (key === "total") {
      continue;
    }

    map.set(normalizeToWorkspaceRelative(key), value);
  }

  return map;
}

function loadCoverageDetails() {
  const coveragePath = path.join(process.cwd(), "coverage", "coverage-final.json");
  if (!existsSync(coveragePath)) {
    throw new Error("coverage details missing at coverage/coverage-final.json; run tests with coverage before coverage:changed");
  }

  const raw = readFileSync(coveragePath, "utf8");
  const parsed = JSON.parse(raw);
  const map = new Map();

  for (const [key, value] of Object.entries(parsed)) {
    map.set(normalizeToWorkspaceRelative(key), value);
  }

  return map;
}

function stripComments(source) {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/(^|\s)\/\/.*$/gm, "");
}

function isTypeOnlyModule(filePath) {
  const absolutePath = path.join(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    return false;
  }

  const source = stripComments(readFileSync(absolutePath, "utf8"));
  const normalized = source.replaceAll(/\s+/g, " ").trim();

  if (normalized.length === 0 || normalized === "export {};") {
    return true;
  }

  const hasRuntimeImport = /\bimport\s+(?!type\b)/.test(normalized);
  const hasRuntimeExport = /\bexport\s+(async\s+)?(function|class|const|let|var|enum)\b/.test(normalized);
  const hasRuntimeDeclaration = /\b(async\s+)?function\b|\bclass\b|\bconst\b|\blet\b|\bvar\b|\benum\b/.test(normalized);

  return !hasRuntimeImport && !hasRuntimeExport && !hasRuntimeDeclaration;
}

function formatMetric(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function locationContainsLine(location, line) {
  return location.start.line <= line && location.end.line >= line;
}

function collectExecutableAddedLineFailures(fileCoverage, addedLines) {
  const failures = [];
  const statementMap = fileCoverage.statementMap ?? {};
  const statementCounts = fileCoverage.s ?? {};
  const branchMap = fileCoverage.branchMap ?? {};
  const branchCounts = fileCoverage.b ?? {};

  for (const line of addedLines) {
    const statements = Object.entries(statementMap)
      .filter(([, location]) => locationContainsLine(location, line));
    if (statements.length > 0 && statements.every(([id]) => (statementCounts[id] ?? 0) === 0)) {
      failures.push(`line ${line} is not covered`);
      continue;
    }

    for (const [id, branch] of Object.entries(branchMap)) {
      const branchLocations = branch.locations ?? [];
      const touchesLine = branchLocations.some((location) => locationContainsLine(location, line));
      if (!touchesLine) {
        continue;
      }

      const uncoveredBranchIndex = (branchCounts[id] ?? []).findIndex((count) => count === 0);
      if (uncoveredBranchIndex !== -1) {
        failures.push(`line ${line} has uncovered branch ${uncoveredBranchIndex + 1}`);
      }
    }
  }

  return [...new Set(failures)];
}

function main() {
  const changedFiles = getChangedFiles();
  const candidates = changedFiles.filter(isSourceCandidate);

  if (candidates.length === 0) {
    console.log("coverage:changed: no changed source files detected; skipping");
    return;
  }

  const coverageMap = loadCoverageSummary();
  const coverageDetails = loadCoverageDetails();
  const failures = [];
  const diffCoveredFiles = [];

  for (const file of candidates) {
    const coverage = coverageMap.get(file);
    if (!coverage) {
      if (isTypeOnlyModule(file)) {
        continue;
      }

      failures.push(`${file}: no coverage entry found`);
      continue;
    }

    const metricFailures = METRICS
      .map((metric) => {
        const pct = coverage?.[metric]?.pct;
        return { metric, pct };
      })
      .filter(({ pct }) => typeof pct !== "number" || pct < REQUIRED_THRESHOLD)
      .map(({ metric, pct }) => `${metric}=${formatMetric(pct)}%`);

    if (metricFailures.length === 0) {
      continue;
    }

    const addedLines = getChangedAddedLines(file);
    const fileCoverage = coverageDetails.get(file);
    if (addedLines !== null && fileCoverage !== undefined) {
      const diffFailures = collectExecutableAddedLineFailures(fileCoverage, addedLines);
      if (diffFailures.length === 0) {
        diffCoveredFiles.push(file);
        continue;
      }

      failures.push(
        `${file}: ${metricFailures.join(", ")} (required >= ${REQUIRED_THRESHOLD}%); changed executable lines not fully covered: ${diffFailures.join(", ")}`
      );
      continue;
    }

    failures.push(`${file}: ${metricFailures.join(", ")} (required >= ${REQUIRED_THRESHOLD}%)`);
  }

  if (failures.length > 0) {
    console.error("coverage:changed: required thresholds not met");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  const diffCoveredSuffix = diffCoveredFiles.length > 0
    ? `; ${diffCoveredFiles.length} below-threshold file(s) passed by changed-line coverage`
    : "";
  console.log(`coverage:changed: passed for ${candidates.length} changed source file(s)${diffCoveredSuffix}`);
}

main();
