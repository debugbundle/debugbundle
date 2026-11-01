import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { watchCommand } from "../../../apps/cli/src/watch-command.js";
import { createWatchFixtureRepository } from "../../helpers/cli-watch-fixture.js";

async function cloudFixture() {
  const root = await createWatchFixtureRepository();
  await writeFile(
    join(root, ".debugbundle/local/connection.json"),
    JSON.stringify({
      mode: "connected",
      cloud_project_id: "fixture",
      cloud_base_url: "https://api.debugbundle.test",
      environments: {
        local: { delivery: "local-only" },
        development: { delivery: "local-only" },
        staging: { delivery: "local-only" },
        production: { delivery: "cloud-enabled" }
      }
    })
  );
  const log = join(root, "var/log/fixture.ndjson");
  await mkdir(join(root, "var/log"), { recursive: true });
  await writeFile(log, "");
  return { root, log };
}
const largeRecords = () =>
  Array.from({ length: 100 }, (_, index) =>
    JSON.stringify({
      type: "error",
      error_type: "FixtureError",
      message: `${index}: ${"é\n".repeat(2000)}`,
      stack: "FixtureError: retained",
      file: "/srv/fixture.php",
      line: 42,
      timestamp: "2026-10-27T12:00:00Z",
      environment: "test",
      service: "fixture"
    })
  ).join("\n") + "\n";

it("ships a large appended batch in bounded final UTF-8 requests without losing records", async () => {
  const { root, log } = await cloudFixture();
  const controller = new AbortController();
  let polls = 0;
  const sendEvents = vi.fn(async ({ events }: { events: unknown[] }) => {
    expect(Buffer.byteLength(JSON.stringify({ events }), "utf8")).toBeLessThanOrEqual(256 * 1024);
    return { accepted: events.length, rejected: 0, errors: [] };
  });
  const result = await watchCommand(
    { logPath: log, format: "debugbundle-ndjson", cloud: true, json: true },
    {
      cwd: () => root,
      readEnv: () => "synthetic",
      signal: controller.signal,
      sendEvents,
      sleep: async () => {
        if (++polls === 1) await writeFile(log, largeRecords());
        else controller.abort();
      }
    }
  );
  expect(result.exitCode).toBe(0);
  expect(sendEvents.mock.calls.length).toBeGreaterThan(1);
  expect(sendEvents.mock.calls.flatMap(([input]) => input.events)).toHaveLength(100);
  expect(JSON.parse(result.output)).toMatchObject({
    events_ingested: 100,
    batches_shipped: sendEvents.mock.calls.length
  });
  expect(await readdir(join(root, ".debugbundle/local/events"))).toEqual([]);
});
it("stops on a partial chunk acknowledgement and does not claim the remaining tail", async () => {
  const { root, log } = await cloudFixture();
  const controller = new AbortController();
  let polls = 0,
    calls = 0;
  const sendEvents = vi.fn(async ({ events }: { events: unknown[] }) =>
    ++calls === 1
      ? { accepted: events.length, rejected: 0, errors: [] }
      : { accepted: events.length - 1, rejected: 1, errors: [{ index: 0, reason: "rate_limited" }] }
  );
  const result = await watchCommand(
    { logPath: log, format: "debugbundle-ndjson", cloud: true, json: true },
    {
      cwd: () => root,
      readEnv: () => "synthetic",
      signal: controller.signal,
      sendEvents,
      sleep: async () => {
        if (++polls === 1) await writeFile(log, largeRecords());
        else controller.abort();
      }
    }
  );
  expect(result).toEqual({
    exitCode: 1,
    output: "Cloud watch ingestion did not fully accept the appended batch."
  });
  expect(sendEvents).toHaveBeenCalledTimes(2);
});
