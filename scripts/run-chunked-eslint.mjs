#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const chunkSize = 50;
const ignoredDirectoryNames = new Set([
  ".git",
  ".local-notes",
  ".local-repos",
  ".next",
  ".tmp",
  ".venv",
  "coverage",
  "dist",
  "examples",
  "node_modules",
  "sdks",
  "site"
]);
const ignoredRelativeDirectories = new Set(["tests/apps/public-site", "tests/site"]);

function collectTypeScriptFiles(directory, relativeDirectory = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (
        ignoredDirectoryNames.has(entry.name) ||
        ignoredRelativeDirectories.has(relativePath)
      ) {
        continue;
      }
      files.push(...collectTypeScriptFiles(resolve(directory, entry.name), relativePath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(relativePath);
    }
  }
  return files;
}

const files = collectTypeScriptFiles(process.cwd()).sort();
const eslint = resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "eslint.cmd" : "eslint"
);

for (let offset = 0; offset < files.length; offset += chunkSize) {
  const result = spawnSync(eslint, files.slice(offset, offset + chunkSize), {
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.signal) {
    process.stderr.write(`eslint_terminated:${result.signal}\n`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

