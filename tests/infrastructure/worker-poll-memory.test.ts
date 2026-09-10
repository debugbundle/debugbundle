import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("keeps retained idle-poll memory bounded across 200,000 completed polls", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--expose-gc",
      "--max-old-space-size=384",
      "--import",
      "tsx",
      "scripts/check-worker-poll-memory.mjs"
    ],
    { timeout: 30_000, maxBuffer: 64 * 1024 }
  );
  expect(stdout).toContain('"label":"200k"');
  expect(stdout).toContain('"label":"shutdown"');
}, 35_000);
