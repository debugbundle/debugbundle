#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GEMINI_EXTENSION_FILES } from "./gemini-extension-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "plugins/debugbundle-gemini");
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--repository" || !args[1])) {
  throw new Error(
    "usage: verify-gemini-publication.mjs [--repository <Git URL or local repository>]"
  );
}
const repository = args[1] ?? "https://github.com/debugbundle/debugbundle-gemini.git";
const manifest = JSON.parse(readFileSync(join(source, "gemini-extension.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/u.test(manifest.version)) throw new Error("invalid_source_extension_version");
const versionTag = `v${manifest.version}`;
const scratch = mkdtempSync(join(tmpdir(), "debugbundle-gemini-publication-"));
const checkout = join(scratch, "public");
const git = (...gitArgs) =>
  execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

try {
  git("clone", "--quiet", "--branch", "main", repository, checkout);
  const expected = [...GEMINI_EXTENSION_FILES].sort();
  const actual = git("-C", checkout, "ls-files", "-z").split("\0").filter(Boolean).sort();
  const extra = actual.filter((path) => !expected.includes(path));
  if (extra.length) throw new Error(`unexpected_public_extension_files:${extra.join(",")}`);
  const missing = expected.filter((path) => !actual.includes(path));
  if (missing.length) throw new Error(`missing_public_extension_files:${missing.join(",")}`);

  for (const path of expected) {
    if (!lstatSync(join(checkout, path)).isFile()) {
      throw new Error(`public_extension_file_not_regular:${path}`);
    }
    if (!readFileSync(join(source, path)).equals(readFileSync(join(checkout, path)))) {
      throw new Error(`public_extension_content_mismatch:${path}`);
    }
  }

  const publicCommit = git("-C", checkout, "rev-parse", "HEAD");
  let tagCommit;
  try {
    tagCommit = git("-C", checkout, "rev-parse", "--verify", `refs/tags/${versionTag}^{commit}`);
  } catch {
    throw new Error(`public_extension_tag_missing:${versionTag}`);
  }
  if (tagCommit !== publicCommit) throw new Error(`public_extension_tag_not_at_main:${versionTag}`);
  process.stdout.write(
    `Gemini public extension matches core source: ${manifest.version} ${publicCommit}\n`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
