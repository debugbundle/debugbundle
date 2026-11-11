import { afterEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { createDevMockApi } from "../../scripts/dev-mock/api.js";
import { createDevMockMiddleware } from "../../apps/web/dev-mock-plugin.js";
import {
  createReportApi,
  createReportRunApi,
  createReportPdfApi,
  createReportDeliveryApi
} from "../../packages/report-client/src/index.js";
import { createImprovementReviewApi } from "../../packages/improvement-review-client/src/index.js";
import { createOrganizationApi } from "../../packages/organization-client/src/index.js";
import { ReportContentViewSchema } from "../../packages/smart-reports/src/report-content.js";
import { isReportPdfBytes } from "../../packages/smart-reports/src/report-pdf.js";
import { ReviewPlanDocumentSchema } from "../../packages/smart-improvements/src/review-planning-contract.js";

afterEach(() => vi.restoreAllMocks());
function setup() {
  const api = createDevMockApi();
  api.handle("POST", "/v1/__dev/billing", {
    action: "configure",
    scenario: {
      plan: "business",
      interval: "month",
      mode: "complimentary",
      additional_capacity_units: 0
    }
  });
  const session = (
    api.handle("GET", "/v1/auth/session").body as {
      session: { organization_id: string; user_id: string };
    }
  ).session;
  const scope = { organizationId: session.organization_id, bearerToken: "mock_not_a_credential" };
  const client = {
    request: async ({ method, path, body }: { method: string; path: string; body?: unknown }) =>
      api.handle(method, path, body)
  };
  return {
    api,
    session,
    scope,
    reviews: createImprovementReviewApi(client),
    definitions: createReportApi(client),
    runs: createReportRunApi(client),
    pdf: createReportPdfApi(client),
    deliveries: createReportDeliveryApi(client),
    people: createOrganizationApi(client)
  };
}
it("opens realistic, canonical full, factual-only, restricted and quiet samples through real clients", async () => {
  const f = setup();
  const definitions = await f.definitions.list(f.scope);
  expect(definitions.length).toBeGreaterThanOrEqual(3);
  const history = await f.runs.list(f.scope);
  expect(history.runs.map((run) => run.status)).toEqual(
    expect.arrayContaining(["ready", "factual_only", "queued", "failed", "skipped_quota"])
  );
  for (const run of history.runs.filter((run) => ["ready", "factual_only"].includes(run.status))) {
    const view = await f.runs.content({ ...f.scope, runId: run.id });
    ReportContentViewSchema.parse(view);
    expect(view.document.name).toContain("Sample");
    expect(view.document.analysis.request_sha256).toBeNull();
    if (run.privacy_mode === "restricted") {
      expect(view.document.report.facts.evidence.every((item) => item.context === null)).toBe(true);
      expect(JSON.stringify(view.document.report.facts)).not.toContain("SayCheese");
    }
  }
  const first = await f.runs.list({ ...f.scope, limit: 2 });
  expect(first.runs).toHaveLength(2);
  const next = await f.runs.list({ ...f.scope, limit: 2, cursor: first.next_cursor! });
  expect(next.runs.every((run) => !first.runs.some((other) => run.id === other.id))).toBe(true);
});
it("loads valid recipient choices and saves/edits definitions with consent, version and scope checks", async () => {
  const f = setup();
  expect((await f.people.listPeople(f.scope)).map((person) => person.user_id)).toContain(
    f.session.user_id
  );
  const input = {
    name: "My sample review",
    cadence: "monthly" as const,
    project_ids: ["00000000-0000-4000-8000-000000000001"],
    recipient_user_ids: [f.session.user_id],
    source_collection_consent: true
  };
  const requestId = "91000000-0000-4000-8000-000000000001";
  const saved = await f.definitions.create({ ...f.scope, requestId, definition: input });
  expect((await f.definitions.create({ ...f.scope, requestId, definition: input })).id).toBe(
    saved.id
  );
  const identity = { ...f.scope, definitionId: saved.id };
  const changed = await f.definitions.replace({
    ...identity,
    definition: { ...input, name: "Edited sample", expected_version: saved.version }
  });
  expect(changed.version).toBe(saved.version + 1);
  await expect(
    f.definitions.replace({
      ...identity,
      definition: { ...input, expected_version: saved.version }
    })
  ).rejects.toMatchObject({ code: "report_version_conflict" });
  await expect(
    f.definitions.create({
      ...f.scope,
      requestId: crypto.randomUUID(),
      definition: { ...input, project_ids: [crypto.randomUUID()] }
    })
  ).rejects.toMatchObject({ code: "forbidden" });
  await f.definitions.remove({ ...identity, expectedVersion: changed.version });
  await expect(f.definitions.get(identity)).rejects.toMatchObject({ status: 404 });
});
it("generates a quiet example without inventing resolutions or outstanding work", async () => {
  const f = setup();
  const definition = (await f.definitions.list(f.scope)).find((item) =>
    item.name.includes("Quiet")
  )!;
  const period = (await f.runs.list(f.scope)).runs.find(
    (item) => item.definition_id === definition.id
  )!.period;
  const run = await f.runs.generate({
    ...f.scope,
    command: {
      request_id: crypto.randomUUID(),
      definition_id: definition.id,
      expected_version: definition.version,
      period
    }
  });
  const identity = { ...f.scope, runId: run.id };
  for (let index = 0; index < 3; index++) await f.runs.get(identity);
  const { document } = await f.runs.content(identity);
  expect(document.report.facts.evidence).toEqual([]);
  expect(
    document.report.facts.metrics.every((item) => item.current === 0 && item.current_complete)
  ).toBe(true);
  expect(document.narrative?.priorities).toEqual([]);
  expect(document.narrative?.overview.text).toContain("observations are quiet");
});
it("simulates generation once, polls to completion and renders facts without a provider or email", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No provider may be called"));
  const f = setup();
  const definition = (await f.definitions.list(f.scope))[0]!;
  const existing = (await f.runs.list(f.scope)).runs.find(
    (run) => run.definition_id === definition.id
  )!;
  const command = {
    request_id: crypto.randomUUID(),
    definition_id: definition.id,
    expected_version: definition.version,
    period: existing.period,
    send_email: true
  };
  const before = await f.definitions.allowance({ ...f.scope, definitionId: definition.id });
  const run = await f.runs.generate({ ...f.scope, command });
  expect((await f.runs.generate({ ...f.scope, command })).id).toBe(run.id);
  const identity = { ...f.scope, runId: run.id };
  const states = [];
  for (let i = 0; i < 4; i++) states.push((await f.runs.get(identity)).status);
  expect(states).toContain("processing");
  expect(states.at(-1)).toBe("ready");
  expect((await f.runs.content(identity)).document.narrative).not.toBeNull();
  expect((await f.definitions.allowance({ ...f.scope, definitionId: definition.id })).used).toBe(
    before.used + 1
  );
  expect(
    (await f.deliveries.list(identity)).every((delivery) => delivery.status === "suppressed")
  ).toBe(true);
  await f.runs.remove(identity);
  await expect(f.runs.content(identity)).rejects.toMatchObject({ status: 404 });
  expect((await f.definitions.allowance({ ...f.scope, definitionId: definition.id })).used).toBe(
    before.used + 1
  );
  expect(network).not.toHaveBeenCalled();
});
it("bounds simulated quota and releases only a cancelled unfinished generation once", async () => {
  const f = setup(),
    definition = (await f.definitions.list(f.scope))[0]!;
  const period = (await f.runs.list(f.scope)).runs[0]!.period;
  const identity = { ...f.scope, definitionId: definition.id };
  const before = await f.definitions.allowance(identity);
  const admitted = [];
  for (let index = 0; index < before.remaining; index++)
    admitted.push(
      await f.runs.generate({
        ...f.scope,
        command: {
          request_id: crypto.randomUUID(),
          definition_id: definition.id,
          expected_version: definition.version,
          period
        }
      })
    );
  expect((await f.definitions.allowance(identity)).remaining).toBe(0);
  await expect(
    f.runs.generate({
      ...f.scope,
      command: {
        request_id: crypto.randomUUID(),
        definition_id: definition.id,
        expected_version: definition.version,
        period
      }
    })
  ).rejects.toMatchObject({ code: "report_quota_exhausted" });
  const cancelled = { ...f.scope, runId: admitted[0]!.id };
  expect((await f.runs.cancel(cancelled)).status).toBe("cancelled");
  await f.runs.cancel(cancelled);
  expect((await f.definitions.allowance(identity)).remaining).toBe(1);
});
it("keeps archives scoped and authenticated and rejects invalid pagination", async () => {
  const f = setup();
  const run = (await f.runs.list(f.scope)).runs[0]!;
  const path = `/v1/organizations/${f.scope.organizationId}/reports/${run.id}`;
  expect(
    f.api.handle("GET", path.replace(f.scope.organizationId, crypto.randomUUID()) + "/document")
      .status
  ).toBe(404);
  expect(
    f.api.handle("GET", `/v1/organizations/${f.scope.organizationId}/reports?limit=101`).status
  ).toBe(400);
  f.api.handle("POST", "/v1/auth/logout");
  for (const suffix of ["", "/document", "/html", "/pdf", "/pdf/file", "/deliveries"])
    expect(f.api.handle("GET", path + suffix).status).toBe(401);
});
it("serves escaped HTML and a real PDF from the local middleware", async () => {
  const middleware = createDevMockMiddleware();
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(418);
      res.end();
    })
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const { session } = (await (await fetch(`${origin}/v1/auth/session`)).json()) as {
      session: { organization_id: string };
    };
    const { runs } = (await (
      await fetch(`${origin}/v1/organizations/${session.organization_id}/reports`)
    ).json()) as { runs: Array<{ id: string; status: string }> };
    const id = runs.find((run) => run.status === "ready")!.id;
    const path = `${origin}/v1/organizations/${session.organization_id}/reports/${id}`;
    const html = await fetch(path + "/html");
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(await html.text()).toContain("<!doctype html>");
    expect(
      (
        await fetch(path + "/pdf", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: "{}"
        })
      ).status
    ).toBe(200);
    const pdf = await fetch(path + "/pdf/file");
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(isReportPdfBytes(new Uint8Array(await pdf.arrayBuffer()))).toBe(true);
    expect(
      (await fetch(path + "/html", { headers: { origin: "https://foreign.example.test" } })).status
    ).toBe(403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

it("exercises weekly review states and consent withdrawal without external work", async () => {
  const f = setup(),
    history = await f.reviews.list(f.scope);
  expect(history.reviews.map((review) => review.status)).toEqual(
    expect.arrayContaining([
      "ready",
      "factual_only",
      "no_data",
      "no_change",
      "queued",
      "skipped_quota",
      "paused_access",
      "failed"
    ])
  );
  for (const review of history.reviews) await f.reviews.bundle({ ...f.scope, reviewId: review.id });
  const ready = history.reviews.find((review) => review.status === "ready")!;
  const planned = ReviewPlanDocumentSchema.parse(
    (await f.reviews.plan({ ...f.scope, reviewId: ready.id })).bundle
  );
  expect(planned.plans[0]).toMatchObject({ action: "review_noise" });
  expect((await f.reviews.bundle({ ...f.scope, reviewId: ready.id })).bundle?.schema_version).toBe(
    "improvement_review.v1"
  );
  expect((await f.reviews.settings(f.scope)).enabled).toBe(false);
  await f.reviews.update({
    ...f.scope,
    command: {
      expected_version: 0,
      enabled: true,
      project_ids: [history.reviews[0]!.project_id],
      source_consent: true
    }
  });
  await f.reviews.update({
    ...f.scope,
    command: { expected_version: 1, enabled: false, project_ids: [], source_consent: false }
  });
  expect((await f.reviews.list(f.scope)).reviews).toEqual([]);
});
