import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { processCommand } from "../../../apps/cli/src/process-command.js";
import { BundleV1Schema } from "../../../packages/shared-types/src/index.js";
import {
  createProcessFixtureRepository,
  writeEventBatch
} from "../../helpers/local-processing-fixture.js";
import { rustSdkEvents } from "../../helpers/rust-sdk-fixtures.js";

it("processes actual Rust local output with recovery context while leaving the incident open", async () => {
  const events = rustSdkEvents();
  const outputs: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const directory = await createProcessFixtureRepository();
    try {
      await writeEventBatch(directory, "1794533809628-0-artifact-local-rust.events.json", events);
      const receivedAt = new Date(events.at(-1)!.occurred_at);
      const result = await processCommand(
        { json: true },
        { cwd: () => directory, now: () => receivedAt }
      );
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.output)).toMatchObject({
        events_processed: 3,
        incidents_processed: 1
      });
      const bundles = join(directory, ".debugbundle/bundles/local");
      const files = (await readdir(bundles)).filter((file) => file.endsWith(".bundle.json"));
      expect(files).toHaveLength(1);
      const bytes = await readFile(join(bundles, files[0]!), "utf8");
      const bundle = BundleV1Schema.parse(JSON.parse(bytes));
      expect(bundle.service.runtime).toBe("rust");
      expect(bundle.signal.occurrence_count).toBe(1);
      expect(bundle.context.error?.exception_evidence?.nodes).toHaveLength(2);
      expect(bundle.context.recovery?.outcome).toBe("recovered");
      expect(bundle.context.probe_data?.items).toHaveLength(1);
      const state = JSON.parse(
        await readFile(join(directory, ".debugbundle/local/state.json"), "utf8")
      ) as { incidents: Record<string, { status: string }> };
      expect(Object.values(state.incidents).map((incident) => incident.status)).toEqual(["open"]);
      const repeated = await processCommand(
        { json: true },
        { cwd: () => directory, now: () => receivedAt }
      );
      expect(JSON.parse(repeated.output)).toMatchObject({ processed: false, events_processed: 0 });
      // Local links intentionally include the repository path; normalize only
      // that outer location when comparing independent deterministic runs.
      outputs.push(bytes.split(directory).join("<fixture-root>"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  expect(outputs[1]).toBe(outputs[0]);
});
