import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createApiDependencies } from "../../apps/api/src/default-dependencies.js";
import { createApiServer } from "../../apps/api/src/server.js";
import {
  AnalyticsFlowResponseSchema,
  AnalyticsFlowReportSchema
} from "../../packages/shared-types/src/index.js";
import {
  bootstrapStorageAndCreateBucket,
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  createTestObjectStore,
  createTestQueue,
  runIntegration,
  seedOwnedProject
} from "../helpers/integration-setup.js";

const source = "https://www.customer.test";
const auth = "https://auth.customer.test";
const destination = "https://app.customer.test";
const secret = () => randomBytes(32).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sdkModule = process.env["INTEGRATION_FLOW_SDK_MODULE"];

runIntegration("public flow runtime composition", () => {
  const pool = createIntegrationPool();
  const s3 = createS3AdminClient();
  let queue: ReturnType<typeof createTestQueue>;
  let app: ReturnType<typeof createApiServer>;
  let endpoint: string;
  const createdProjects: string[] = [];
  const transport = globalThis.fetch;
  beforeAll(async () => {
    await bootstrapStorageAndCreateBucket(pool, s3);
    queue = createTestQueue();
    app = createApiServer(
      createApiDependencies({
        db: createQueryable(pool),
        objectStore: createTestObjectStore(),
        queue
      })
    );
    endpoint = await app.listen({ host: "127.0.0.1", port: 0 });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    // Other integration fixtures use historical clocks; do not leave today's runs behind.
    await pool.query("DELETE FROM projects WHERE id=ANY($1::uuid[])", [createdProjects]);
    createdProjects.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await queue.close();
    await pool.end();
    s3.destroy();
  });

  async function fixture() {
    const projectId = randomUUID();
    const organizationId = randomUUID();
    const { ownerUserId } = await seedOwnedProject({
      pool,
      projectId,
      organizationId,
      organizationName: "Runtime customer",
      organizationSlug: `runtime-${organizationId}`,
      projectName: "Customer app",
      projectSlug: `runtime-${projectId}`,
      organizationPlan: "team"
    });
    createdProjects.push(projectId);
    const projectToken = `dbundle_proj_${secret()}`;
    const memberToken = `dbundle_mem_${secret()}`;
    await pool.query(
      "INSERT INTO project_tokens(id,project_id,token_hash,label,allowed_origins) VALUES($1,$2,$3,'flow test',$4::jsonb)",
      [randomUUID(), projectId, hash(projectToken), JSON.stringify([source, auth, destination])]
    );
    await pool.query(
      "INSERT INTO member_tokens(id,user_id,organization_id,token_hash,label) VALUES($1,$2,$3,$4,'flow test')",
      [randomUUID(), ownerUserId, organizationId, hash(memberToken)]
    );
    await pool.query(
      "INSERT INTO project_analytics_settings(project_id,enabled,consent_required) VALUES($1,true,true)",
      [projectId]
    );
    const managementPath = `/v1/projects/${projectId}/analytics/flows/onboarding`;
    const response = await transport(`${endpoint}${managementPath}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${memberToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        flow_key: "onboarding",
        display_name: "Customer onboarding",
        kind: "acquisition",
        steps: [
          { step_key: "visit", display_name: "Visit", origin: source },
          { step_key: "auth", display_name: "Auth", origin: auth },
          { step_key: "login", display_name: "Login completed", origin: auth },
          { step_key: "app", display_name: "App opened", origin: destination }
        ]
      })
    });
    expect(response.status).toBe(200);
    const { flow } = AnalyticsFlowResponseSchema.parse(await response.json());
    return { projectId, organizationId, projectToken, memberToken, managementPath, flow };
  }

  it("uses real project auth, settings, quotas and persisted definitions through the HTTP API", async () => {
    const fixtureData = await fixture();
    const { projectId, projectToken, memberToken, managementPath, flow } = fixtureData;
    const context = secret();
    const capture = (operation: string, body: object, origin = source) =>
      transport(`${endpoint}/v1/analytics/flows/${projectId}/onboarding/${operation}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${projectToken}`,
          origin,
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
    expect((await capture("start", { context, step_key: "visit" })).status).toBe(403);
    expect((await capture("start", { context, step_key: "visit", consent: true })).status).toBe(
      200
    );
    expect((await capture("start", { context, step_key: "visit", consent: true })).status).toBe(
      200
    );
    const token = secret();
    expect(
      (await capture("handoff", { context, token, step_key: "auth", consent: true })).status
    ).toBe(200);
    const receiver = secret();
    expect(
      (await capture("arrive", { context: receiver, token, consent: true }, destination)).status
    ).toBe(403);
    expect(
      (await capture("arrive", { context: receiver, token, consent: true }, auth)).status
    ).toBe(200);
    expect(
      (await capture("arrive", { context: receiver, token, consent: true }, auth)).status
    ).toBe(200);
    const reportResponse = await transport(`${endpoint}${managementPath}/report?window=7d`, {
      headers: { authorization: `Bearer ${memberToken}` }
    });
    expect(reportResponse.status).toBe(200);
    expect(AnalyticsFlowReportSchema.parse(await reportResponse.json()).flow.id).toBe(flow.id);
    const counts = await pool.query<{ step_index: number; reached: number }>(
      "SELECT step_index,reached::int FROM analytics_flow_rollups WHERE flow_id=$1 ORDER BY step_index",
      [flow.id]
    );
    expect(counts.rows).toEqual([
      { step_index: 0, reached: 1 },
      { step_index: 1, reached: 1 }
    ]);
    const usage = await pool.query<{ analytics_events: number; analytics_sessions: number }>(
      "SELECT analytics_events,analytics_sessions FROM analytics_usage_counters WHERE organization_id=$1",
      [fixtureData.organizationId]
    );
    expect(usage.rows).toEqual([{ analytics_events: 3, analytics_sessions: 1 }]);
    await pool.query("UPDATE project_analytics_settings SET enabled=false WHERE project_id=$1", [
      projectId
    ]);
    expect(
      (await capture("step", { context: receiver, step_key: "login", consent: true }, auth)).status
    ).toBe(403);
    expect((await capture("withdraw", { context: receiver }, auth)).status).toBe(200);
    expect(
      (await pool.query("SELECT id FROM analytics_flow_runs WHERE flow_id=$1", [flow.id])).rows
    ).toEqual([]);
  });

  it.skipIf(!sdkModule)(
    "connects the built Browser SDK to the real HTTP API and database across auth origins",
    async () => {
      const { projectId, projectToken, flow } = await fixture();
      type Client = {
        setConsent(value: boolean): void;
        start(key: string): Promise<boolean>;
        step(key: string): Promise<boolean>;
        handoff(key: string, url: string): Promise<string | null>;
        arrive(): Promise<boolean>;
      };
      const options = { endpoint, projectId, projectToken, flowKey: "onboarding", enabled: true };
      const module = (await import(pathToFileURL(sdkModule!).href)) as {
        createAnalyticsFlowClient: (config: typeof options) => Client;
      };
      const tabs = new Map<string, Map<string, string>>();
      let current: URL;
      function navigate(url: string) {
        current = new URL(url);
        const values = tabs.get(current.origin) ?? new Map<string, string>();
        tabs.set(current.origin, values);
        vi.stubGlobal("window", {
          location: {
            get href() {
              return current.href;
            }
          },
          sessionStorage: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
              values.set(key, value);
            },
            removeItem: (key: string) => {
              values.delete(key);
            }
          },
          history: {
            state: null,
            replaceState: (_state: unknown, _title: string, next: string) => {
              current = new URL(next);
            }
          }
        });
      }
      vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
        expect(init.credentials).toBe("omit");
        const headers = new Headers(init.headers);
        headers.set("origin", current.origin); // Browser-managed header in the real client.
        return transport(url, { ...init, headers });
      });
      const client = () => {
        const result = module.createAnalyticsFlowClient(options);
        result.setConsent(true);
        return result;
      };
      navigate(source);
      const sourceClient = client();
      expect(await sourceClient.start("visit")).toBe(true);
      const authUrl = await sourceClient.handoff("auth", `${auth}/login`);
      expect(authUrl).not.toBeNull();
      navigate(authUrl!);
      expect(await client().arrive()).toBe(true);
      expect(current!.hash).toBe("");
      navigate("https://identity-provider.test/authorize?state=customer-state");
      navigate(`${auth}/callback?state=customer-state`);
      const returned = client();
      expect(await returned.handoff("app", destination)).toBeNull();
      expect(await returned.step("login")).toBe(true);
      expect(current!.searchParams.get("state")).toBe("customer-state");
      const appUrl = await returned.handoff("app", destination);
      expect(appUrl).not.toBeNull();
      navigate(appUrl!);
      expect(await client().arrive()).toBe(true);
      expect(current!.hash).toBe("");
      const counts = await pool.query<{ step_index: number; reached: number }>(
        "SELECT step_index,reached::int FROM analytics_flow_rollups WHERE flow_id=$1 ORDER BY step_index",
        [flow.id]
      );
      expect(counts.rows.map((row) => row.reached)).toEqual([1, 1, 1, 1]);
    }
  );
});
