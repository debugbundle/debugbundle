import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { processCommand } from "../../../apps/cli/src/process-command.js";
import {
  collectLocalDiagnosticContext,
  parseDiagnosticReceipts,
  parseLocalDiagnosticState
} from "../../../apps/cli/src/local-diagnostic-context.js";
import {
  BundleV1Schema,
  createEventEnvelope,
  type EventEnvelope
} from "../../../packages/shared-types/src/index.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (n: number) => new Date(Date.parse("2026-10-26T00:00:00.000Z") + n * 1000).toISOString();
const reference = {
  version: 1 as const,
  failure_ref: id(90),
  scope: { kind: "operation" as const, operation_id: id(91) }
};
const service = { name: "api", environment: "local", runtime: "node" };
function failure() {
  return createEventEnvelope({
    event_id: id(1),
    project_id: id(99),
    event_type: "backend_exception",
    occurred_at: at(0),
    service,
    context: { evidence_reference: reference },
    payload: {
      name: "Error",
      message: "Failed",
      stack: "unavailable",
      handled: true,
      request: { method: "GET", path: "/", query: {}, headers: {} },
      response: { status_code: 500 },
      runtime: { version: "24" }
    }
  });
}
function recovery(
  seconds = 2,
  state: "recovery_observed" | "failure_persisted" = "recovery_observed"
) {
  return createEventEnvelope({
    event_id: id(2),
    project_id: id(99),
    event_type: "diagnostic_context",
    occurred_at: at(seconds),
    service,
    payload: { ...reference, kind: "recovery", attempt_id: id(92), state }
  });
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "debugbundle-diagnostic-"));
  await mkdir(join(root, ".debugbundle/local/events"), { recursive: true });
  const batch = (name: string, events: EventEnvelope[]) =>
    writeFile(
      join(root, ".debugbundle/local/events", `${name}.events.json`),
      JSON.stringify(events)
    );
  const statePath = join(root, ".debugbundle/local/state.json");
  const state = async () =>
    JSON.parse(await readFile(statePath, "utf8")) as {
      incidents: Record<
        string,
        { bundle_path: string; status: string; occurrence_count: number; source_event_id: string }
      >;
      diagnostic_receipts?: Record<string, string>;
    };
  return {
    root,
    batch,
    state,
    statePath,
    receiptPath: join(root, ".debugbundle/local/evidence-receipts.json")
  };
}
it.each([false, true])(
  "joins local context in either arrival order without creating or reopening incidents, contextFirst=%s",
  async (contextFirst) => {
    const f = await fixture();
    await f.batch("001", [contextFirst ? recovery() : failure()]);
    await processCommand({ json: true }, { cwd: () => f.root, now: () => new Date(at(3)) });
    let state = await f.state();
    expect(Object.keys(state.incidents)).toHaveLength(contextFirst ? 0 : 1);
    if (!contextFirst) {
      for (const incident of Object.values(state.incidents)) incident.status = "resolved";
      await writeFile(f.statePath, JSON.stringify(state));
    }
    await f.batch("002", [contextFirst ? failure() : recovery()]);
    await processCommand({ json: true }, { cwd: () => f.root, now: () => new Date(at(4)) });
    state = await f.state();
    expect(Object.keys(state.incidents)).toHaveLength(1);
    const incident = Object.values(state.incidents)[0]!;
    expect(incident.occurrence_count).toBe(1);
    expect(incident.source_event_id).toBe(id(1));
    expect(incident.status).toBe(contextFirst ? "open" : "resolved");
    const bundle = BundleV1Schema.parse(
      JSON.parse(await readFile(join(f.root, incident.bundle_path), "utf8"))
    );
    expect(bundle.context.recovery?.outcome).toBe("recovered");
    expect(bundle.captured_at).toBe(at(0));
    expect(bundle.signal.last_seen_at).toBe(at(0));
    expect(bundle.metadata.updated_at).toBe(at(4));
    const before = await readFile(join(f.root, incident.bundle_path), "utf8");
    await f.batch("003", [recovery()]);
    await processCommand({}, { cwd: () => f.root, now: () => new Date(at(5)) });
    expect(await readFile(join(f.root, incident.bundle_path), "utf8")).toBe(before);
  }
);
it("keeps a rejected future context's first receipt during a full replay", async () => {
  const f = await fixture();
  await f.batch("001", [failure(), recovery(62)]);
  await processCommand({}, { cwd: () => f.root, now: () => new Date(at(0)) });
  await writeFile(f.statePath, "{corrupt");
  await processCommand({ preset: "minimal" }, { cwd: () => f.root, now: () => new Date(at(100)) });
  const state = await f.state(),
    incident = Object.values(state.incidents)[0]!;
  expect(state.diagnostic_receipts?.[id(2)]).toBe(at(0));
  const bundle = BundleV1Schema.parse(
    JSON.parse(await readFile(join(f.root, incident.bundle_path), "utf8"))
  );
  expect(bundle.context.recovery?.outcome).toBe("unknown");
});

it("rejects changed diagnostic payloads after a full local replay", async () => {
  const f = await fixture();
  await f.batch("001", [failure(), recovery(62)]);
  await processCommand({}, { cwd: () => f.root, now: () => new Date(at(0)) });
  // Editing an initially rejected event must not turn it into accepted recovery
  // evidence when the ordinary processing state has to be rebuilt.
  await f.batch("001", [failure(), recovery(2)]);
  await writeFile(f.statePath, "{corrupt");
  await processCommand({}, { cwd: () => f.root, now: () => new Date(at(100)) });
  const incident = Object.values((await f.state()).incidents)[0]!;
  const bundle = BundleV1Schema.parse(
    JSON.parse(await readFile(join(f.root, incident.bundle_path), "utf8"))
  );
  expect(bundle.context.recovery?.outcome).toBe("unknown");
  expect(incident.occurrence_count).toBe(1);
});

it.each([false, true])(
  "keeps an accepted payload's identity when its file changes, rebuild=%s",
  async (rebuild) => {
    const f = await fixture();
    await f.batch("001", [failure(), recovery()]);
    await processCommand({}, { cwd: () => f.root, now: () => new Date(at(3)) });
    const changed = recovery(2, "failure_persisted");
    await f.batch("001", [failure(), changed]);
    if (rebuild) await writeFile(f.statePath, "{corrupt");
    await processCommand({ preset: "minimal" }, { cwd: () => f.root, now: () => new Date(at(4)) });
    const incident = Object.values((await f.state()).incidents)[0]!;
    const bundle = BundleV1Schema.parse(
      JSON.parse(await readFile(join(f.root, incident.bundle_path), "utf8"))
    );
    expect(bundle.context.recovery?.outcome).toBe(rebuild ? "unknown" : "recovered");
  }
);

it("accepts canonical retries and upgrades timestamp-only ledgers without renewing them", async () => {
  const f = await fixture();
  await f.batch("001", [failure(), recovery()]);
  await writeFile(f.receiptPath, JSON.stringify({ [id(2)]: at(3) }));
  await processCommand({}, { cwd: () => f.root, now: () => new Date(at(4)) });
  const original = JSON.parse(await readFile(f.receiptPath, "utf8"));
  expect(original[id(2)]).toEqual({
    received_at: at(3),
    payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
  });
  const retry = recovery();
  retry.service = { runtime: "node", environment: "local", name: "api" };
  await f.batch("001", [failure(), retry]);
  await writeFile(f.statePath, "{corrupt");
  await processCommand({}, { cwd: () => f.root, now: () => new Date(at(5)) });
  expect(JSON.parse(await readFile(f.receiptPath, "utf8"))).toEqual(original);
  const incident = Object.values((await f.state()).incidents)[0]!;
  const bundle = BundleV1Schema.parse(
    JSON.parse(await readFile(join(f.root, incident.bundle_path), "utf8"))
  );
  expect(bundle.context.recovery?.outcome).toBe("recovered");
});

it.each([
  null,
  { invalid: at(0) },
  { [id(2)]: "not a date" },
  { [id(2)]: { received_at: at(0), payload_hash: "invalid" } },
  { [id(2)]: { received_at: at(0), payload_hash: 3 } },
  { [id(2)]: { received_at: at(0), unexpected: true } }
])("rejects corrupt durable receipt ledgers instead of renewing evidence: %j", (ledger) => {
  expect(() => parseDiagnosticReceipts(ledger)).toThrow("Invalid local evidence receipt ledger.");
});

it("preserves legacy processing state and rejects malformed payload identity metadata", () => {
  const legacy = {
    diagnostic_contexts: [{ event: recovery(), received_at: at(3) }],
    diagnostic_receipts: { [id(2)]: at(3) }
  };
  expect(parseLocalDiagnosticState(legacy)?.diagnostic_contexts).toHaveLength(1);
  for (const hashes of [[], { [id(2)]: "invalid" }, { [id(3)]: "a".repeat(64) }])
    expect(parseLocalDiagnosticState({ ...legacy, diagnostic_payload_hashes: hashes })).toBeNull();
});

it("retains chronological context and immutable receipts after payload expiry", () => {
  const first = { ...recovery(1), event_id: id(3) };
  const second = recovery(2);
  const collected = collectLocalDiagnosticContext(null, [second, first], at(3));
  expect(collected.diagnostic_contexts?.map(({ event }) => event.event_id)).toEqual([id(3), id(2)]);
  expect(collectLocalDiagnosticContext(null, [first, second], at(3))).toEqual(collected);
  const expired = collectLocalDiagnosticContext(collected, [], at(8 * 86_400));
  expect(expired.diagnostic_contexts).toEqual([]);
  expect(expired.diagnostic_payload_hashes).toEqual(collected.diagnostic_payload_hashes);
  expect(expired.diagnostic_receipts).toEqual(collected.diagnostic_receipts);
});

it("withholds retained context that disagrees with its durable payload identity", () => {
  const collected = collectLocalDiagnosticContext(null, [recovery()], at(3));
  const changed = {
    ...collected,
    diagnostic_contexts: [{ event: recovery(2, "failure_persisted"), received_at: at(3) }]
  };
  const checked = collectLocalDiagnosticContext(changed, [], at(4));
  expect(checked.diagnostic_contexts).toEqual([]);
  expect(checked.diagnostic_payload_hashes).toEqual(collected.diagnostic_payload_hashes);
});
