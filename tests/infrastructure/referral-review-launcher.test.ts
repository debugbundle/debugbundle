import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function runLauncher(mode: string, action = "up") {
  const root = mkdtempSync(join(tmpdir(), "referral-review-launcher-"));
  roots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "bin"));
  copyFileSync(
    "scripts/referral-public-review.sh",
    join(root, "scripts/referral-public-review.sh")
  );
  writeFileSync(
    join(root, "bin/docker"),
    String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const root = process.env.REVIEW_TEST_ROOT;
const mode = process.env.REVIEW_TEST_MODE;
fs.appendFileSync(root + "/commands", JSON.stringify(args) + "\n");
if (args[0] === "network" && args[1] === "inspect") {
  if (mode === "foreign-network" && args.at(-1) === "debugbundle_referral-review") {
    if (args.includes("--format")) console.log("foreign-project");
    process.exit(0);
  }
  process.exit(1);
}
if (args[0] === "inspect") {
  const format = args[2];
  if (format.includes("review-owner")) console.log(mode === "foreign" ? "foreign-owner" : "referral-public-review-v1");
  else if (format.includes("compose.project")) console.log(mode === "compose" ? "debugbundle" : "");
  else if (format.includes(".Mounts")) console.log(mode === "foreign-checkout" ? "/tmp" : root);
}
if (args.includes("pg_dump")) {
  if (mode === "dump-failure") process.exit(1);
  console.log("synthetic-review-records");
}
if (args.includes("psql")) fs.writeFileSync(root + "/restored", fs.readFileSync(0));
`,
    { mode: 0o755 }
  );
  const result = spawnSync("sh", [join(root, "scripts/referral-public-review.sh"), action], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env["PATH"] ?? ""}`,
      REVIEW_TEST_ROOT: root,
      REVIEW_TEST_MODE: mode
    }
  });
  const commands = readFileSync(join(root, "commands"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string[]);
  return { result, commands, root };
}

it.each(["foreign", "foreign-checkout", "foreign-network"])(
  "refuses %s targets before starting or removing containers",
  (mode) => {
    const { result, commands } = runLauncher(mode);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing");
    expect(
      commands.some(([command]) => ["rm", "start", "exec", "compose"].includes(command!))
    ).toBe(false);
  }
);

it("does not remove legacy containers when preserving their data fails", () => {
  const { result, commands } = runLauncher("dump-failure");
  expect(result.status).toBe(1);
  expect(commands.some((args) => args.includes("pg_dump"))).toBe(true);
  expect(commands.some(([command]) => ["rm", "compose"].includes(command!))).toBe(false);
});

it("preserves legacy records before replacement and restores them before starting the review API", () => {
  const { result, commands, root } = runLauncher("legacy");
  expect(result.status).toBe(0);
  const dump = commands.findIndex((args) => args.includes("pg_dump"));
  const remove = commands.findIndex(([command]) => command === "rm");
  const restore = commands.findIndex((args) => args.includes("psql"));
  const startApi = commands.findIndex(
    (args) => args[0] === "compose" && args.at(-1) === "referral-review-api"
  );
  expect(dump).toBeGreaterThan(-1);
  expect(remove).toBeGreaterThan(dump);
  expect(restore).toBeGreaterThan(remove);
  expect(startApi).toBeGreaterThan(restore);
  expect(readFileSync(join(root, "restored"), "utf8")).toContain("synthetic-review-records");
});

it("restarts adopted services without replacing their database", () => {
  const { result, commands } = runLauncher("compose");
  expect(result.status).toBe(0);
  expect(commands.some((args) => args[0] === "rm" || args.includes("pg_dump"))).toBe(false);
  expect(
    commands.find((args) => args[0] === "compose" && args.at(-1) === "referral-review-api")
  ).toContain("--force-recreate");
});

it("removes only the two owned fixtures without shutting down the app project", () => {
  const { result, commands } = runLauncher("compose", "down");
  expect(result.status).toBe(0);
  expect(commands.filter(([command]) => command === "rm")).toEqual([
    ["rm", "-f", "debugbundle-referral-review-api"],
    ["rm", "-f", "debugbundle-referral-review-db"]
  ]);
  expect(commands.some(([command]) => command === "compose")).toBe(false);
});
