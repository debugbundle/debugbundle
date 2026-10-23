import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("enforces the fail-closed dependency audit and verified-backport tests", () => {
  expect(() =>
    execFileSync(process.execPath, ["--test", "scripts/dependency-audit.test.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8"
    })
  ).not.toThrow();
});

it.skipIf(!existsSync(join(process.cwd(), "site/package.json")))(
  "keeps the site's vendored audit artifacts identical to core",
  () => {
    for (const file of [
      "scripts/dependency-audit.mjs",
      "scripts/dependency-audit.test.mjs",
      "patches/zod@3.25.76.patch",
      "patches/zod-security-backport.json",
      "patches/ZOD-LICENSE"
    ]) {
      expect(readFileSync(join(process.cwd(), "site", file))).toEqual(
        readFileSync(join(process.cwd(), file))
      );
    }
  }
);
