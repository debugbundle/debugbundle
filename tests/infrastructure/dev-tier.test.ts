import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
function run(env: Record<string, string> = {}) {
  const path = mkdtempSync(join(tmpdir(), "debugbundle-dev-tier-"));
  temporary.push(path);
  const calls = join(path, "calls.jsonl");
  writeFileSync(
    join(path, "docker"),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_CALLS, JSON.stringify(args) + '\\n');
if (args[0] === 'context') console.log(process.env.MOCK_ENDPOINT || 'unix:///test.sock');
else if (args[0] === 'inspect') {
  const format = args[args.indexOf('--format') + 1];
  if (format.includes('.Id')) console.log('a'.repeat(64));
  else if (format.includes('working_dir')) console.log(process.env.MOCK_WORKING_DIR || process.cwd());
  else if (format.includes('service')) console.log('postgres');
  else if (format.includes('.Name')) console.log('/debugbundle-postgres');
  else if (format.includes('Running')) console.log('true');
} else if (args[0] === 'exec') {
  fs.writeFileSync(process.env.MOCK_SQL, fs.readFileSync(0, 'utf8'));
  process.exit(Number(process.env.MOCK_PSQL_STATUS || 0));
} else process.exit(2);
`,
    { mode: 0o700 }
  );
  const result = spawnSync("sh", ["scripts/dev-tier.sh"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path}:${process.env["PATH"]}`,
      NODE_ENV: "test",
      DOCKER_HOST: "",
      DEV_TIER: "business",
      DEV_TIER_ORG: "",
      MOCK_CALLS: calls,
      MOCK_SQL: join(path, "query.sql"),
      ...env
    }
  });
  const commands = (() => {
    try {
      return readFileSync(calls, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]);
    } catch {
      return [];
    }
  })();
  return { ...result, commands, path };
}

it.each(["free", "solo", "team", "business"])(
  "switches %s only through the verified local Postgres socket",
  (tier) => {
    const result = run({ DEV_TIER: tier });
    expect(result.status, result.stderr).toBe(0);
    const exec = result.commands.find((args) => args[0] === "exec")!;
    expect(exec).toContain("a".repeat(64));
    expect(exec).toContain("/var/run/postgresql");
    expect(exec).toContain(`target_plan=${tier}`);
    expect(readFileSync(join(result.path, "query.sql"), "utf8")).toContain("FOR UPDATE");
  }
);
it.each([
  { DEV_TIER: "enterprise" },
  { DEV_TIER: "business; touch /tmp/invalid-dev-tier" },
  { DEV_TIER_ORG: "all" },
  { NODE_ENV: "production" },
  { DOCKER_HOST: "ssh://production" },
  { MOCK_ENDPOINT: "tcp://remote:2375" },
  { MOCK_WORKING_DIR: "/tmp" }
])("rejects unsafe tier-switch inputs before database access: %j", (env) => {
  const result = run(env);
  expect(result.status).not.toBe(0);
  expect(result.commands.some((args) => args[0] === "exec")).toBe(false);
});
it("propagates a database refusal without claiming success", () => {
  const result = run({ MOCK_PSQL_STATUS: "37" });
  expect(result.status).toBe(37);
  expect(result.stdout).not.toContain("Refresh");
});

it("uses read-only inspection when no tier change is requested", () => {
  const result = run({ DEV_TIER: "status" });
  expect(result.status, result.stderr).toBe(0);
  expect(result.commands.find((args) => args[0] === "exec")).toContain("target_plan=status");
  expect(result.stdout).not.toContain("Refresh");
});
