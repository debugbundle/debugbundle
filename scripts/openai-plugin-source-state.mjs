import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

function gitOutput(repoRoot, args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function gitSucceeds(repoRoot, args) {
  try {
    execFileSync("git", args, { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isCommitId(value) {
  return typeof value === "string" && /^[0-9a-f]{40,64}$/u.test(value);
}

function canReuseRecordedCommit({
  repoRoot,
  currentCommit,
  recordedCommit,
  releaseManifestRelativePath
}) {
  if (!isCommitId(recordedCommit)) return false;
  if (recordedCommit === currentCommit) return true;
  if (!gitSucceeds(repoRoot, ["merge-base", "--is-ancestor", recordedCommit, currentCommit])) {
    return false;
  }
  return gitSucceeds(repoRoot, [
    "diff",
    "--quiet",
    recordedCommit,
    currentCommit,
    "--",
    ".",
    `:(exclude)${releaseManifestRelativePath}`
  ]);
}

export function readOpenAiPluginSourceState({
  repoRoot,
  releaseManifestRelativePath,
  recordedCommit
}) {
  const currentCommit = gitOutput(repoRoot, ["rev-parse", "HEAD"]);
  const commit = canReuseRecordedCommit({
    repoRoot,
    currentCommit,
    recordedCommit,
    releaseManifestRelativePath
  })
    ? recordedCommit
    : currentCommit;
  const statusLines = gitOutput(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"])
    .split("\n")
    .filter((line) => line.length > 0)
    .filter((line) => !line.endsWith(releaseManifestRelativePath))
    .filter((line) => !line.includes(" dist/"))
    .sort();

  return {
    commit,
    tree_clean: statusLines.length === 0,
    status_sha256: createHash("sha256").update(statusLines.join("\n"), "utf8").digest("hex")
  };
}
