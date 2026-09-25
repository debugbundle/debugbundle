import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = join(root, "plugins/debugbundle-gemini");
const verifier = join(root, "scripts/verify-gemini-publication.mjs");
const files = [
  "gemini-extension.json",
  "skills/debugbundle/SKILL.md",
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
];
function git(repo: string, ...args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
}

function fixture(
  options: {
    changeReadme?: boolean;
    extraFile?: boolean;
    symlinkReadme?: boolean;
    tag?: boolean;
  } = {}
): string {
  const repo = mkdtempSync(join(tmpdir(), "debugbundle-gemini-publication-"));
  for (const file of files) {
    const destination = join(repo, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(source, file), destination);
  }
  if (options.changeReadme) writeFileSync(join(repo, "README.md"), "changed after packaging\n");
  if (options.symlinkReadme) {
    rmSync(join(repo, "README.md"));
    symlinkSync(join(source, "README.md"), join(repo, "README.md"));
  }
  if (options.extraFile) writeFileSync(join(repo, "unexpected.txt"), "extra file\n");
  git(repo, "init", "-b", "main");
  git(repo, "add", "-A");
  git(
    repo,
    "-c",
    "user.name=DebugBundle Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-m",
    "fixture"
  );
  if (options.tag !== false) git(repo, "tag", "v1.0.0");
  return repo;
}

function verify(repo: string): string {
  return execFileSync(process.execPath, [verifier, "--repository", repo], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

describe("Gemini public extension verification", () => {
  it("requires the exact package files and a matching public version tag", () => {
    const repositories: string[] = [];
    const create = (options?: Parameters<typeof fixture>[0]): string => {
      const repo = fixture(options);
      repositories.push(repo);
      return repo;
    };

    try {
      expect(verify(create())).toContain("Gemini public extension matches core source");
      expect(() => verify(create({ changeReadme: true }))).toThrow(
        /public_extension_content_mismatch:README.md/u
      );
      expect(() => verify(create({ extraFile: true }))).toThrow(
        /unexpected_public_extension_files:unexpected.txt/u
      );
      expect(() => verify(create({ symlinkReadme: true }))).toThrow(
        /public_extension_file_not_regular:README.md/u
      );
      expect(() => verify(create({ tag: false }))).toThrow(/public_extension_tag_missing:v1.0.0/u);
    } finally {
      for (const repo of repositories) rmSync(repo, { recursive: true, force: true });
    }
  });
});
