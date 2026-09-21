import { mkdtemp, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliAuthStateError } from "../../apps/cli/src/auth-state.js";
import { doctorCommand } from "../../apps/cli/src/doctor-command.js";
import { setupCommand } from "../../apps/cli/src/setup-command.js";

const doctorGolden = (
  await readFile(new URL("../fixtures/cli-doctor.golden.txt", import.meta.url), "utf8")
).trimEnd();

async function createDoctorFixtureRepository(): Promise<string> {
  const rootDirectory = await mkdtemp(join(tmpdir(), "debugbundle-doctor-"));

  await mkdir(join(rootDirectory, "apps", "api"), { recursive: true });
  await mkdir(join(rootDirectory, "apps", "worker"), { recursive: true });

  await writeFile(
    join(rootDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "checkout-app",
        packageManager: "pnpm@11.3.0",
        scripts: {
          build: "tsc --noEmit -p tsconfig.json",
          test: "vitest run",
          lint: "eslint ."
        },
        dependencies: {
          fastify: "^5.0.0"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(join(rootDirectory, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n', "utf8");
  await writeFile(
    join(rootDirectory, "tsconfig.json"),
    '{"compilerOptions":{"strict":true}}\n',
    "utf8"
  );
  await writeFile(join(rootDirectory, "AGENTS.md"), "# Repository Rules\n", "utf8");

  return rootDirectory;
}

async function createRelaySpoolFixture(rootDirectory: string, now: Date): Promise<void> {
  const spoolDirectory = join(rootDirectory, ".debugbundle", "local", "browser-relay-spool");
  await mkdir(spoolDirectory, { recursive: true });

  await writeFile(join(spoolDirectory, "20260314-1-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(join(spoolDirectory, "20260314-2-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(join(spoolDirectory, "20260314-3-checkout-web.events.json"), "[]\n", "utf8");
  await writeFile(
    join(spoolDirectory, "20260314-3-checkout-web.events.json.delivered"),
    "\n",
    "utf8"
  );

  const hoursAgo = (hours: number): Date => new Date(now.getTime() - hours * 60 * 60 * 1000);

  await utimes(
    join(spoolDirectory, "20260314-1-checkout-web.events.json"),
    hoursAgo(72),
    hoursAgo(72)
  );
  await utimes(
    join(spoolDirectory, "20260314-2-checkout-web.events.json"),
    hoursAgo(3),
    hoursAgo(3)
  );
  await utimes(
    join(spoolDirectory, "20260314-3-checkout-web.events.json"),
    hoursAgo(48),
    hoursAgo(48)
  );
  await utimes(
    join(spoolDirectory, "20260314-3-checkout-web.events.json.delivered"),
    hoursAgo(1),
    hoursAgo(1)
  );
}

async function markProfileAgentValidated(rootDirectory: string): Promise<void> {
  const profilePath = join(rootDirectory, ".debugbundle", "profile.json");
  const generatedProfile = JSON.parse(await readFile(profilePath, "utf8")) as {
    debugbundle: Record<string, unknown>;
  } & Record<string, unknown>;

  generatedProfile.debugbundle = {
    ...generatedProfile.debugbundle,
    validation_status: "agent-validated"
  };

  await writeFile(profilePath, `${JSON.stringify(generatedProfile, null, 2)}\n`, "utf8");
}

export {
  mkdtemp,
  mkdir,
  readFile,
  utimes,
  writeFile,
  tmpdir,
  join,
  CliAuthStateError,
  doctorCommand,
  setupCommand,
  doctorGolden,
  createDoctorFixtureRepository,
  createRelaySpoolFixture,
  markProfileAgentValidated
};
