import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, expect, it } from "vitest";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { generateMemberToken, generateProjectToken } from "../../packages/auth/src/index.js";
import { migrateStorageSchema } from "../../packages/storage/src/schema-migrations.js";
import type {
  ProjectMergePlan,
  ProjectMergeOperation
} from "../../packages/shared-types/src/project-consolidation.js";
import { restoreStoragePredecessor } from "../helpers/storage-predecessor.js";
import {
  installRuntimeClients,
  runtimePort,
  startRuntime,
  stopRuntime,
  untilRuntime
} from "../helpers/project-service-runtime.js";
import {
  createIntegrationPool,
  createQueryable,
  createS3AdminClient,
  runIntegration,
  seedOwnedProject,
  s3Bucket
} from "../helpers/integration-setup.js";

// Separate explicit Make lane: retained registry artifacts and fresh packed
// candidates are installed in an ephemeral home, never in a consumer repository.
runIntegration("installed project/service runtime compatibility", () => {
  const pool = createIntegrationPool(),
    s3 = createS3AdminClient();
  afterAll(async () => {
    await pool.end();
    s3.destroy();
  });
  it("preserves installed clients, SDK traffic and immutable objects through merge, restart and compatible rollback", async () => {
    const clients = await installRuntimeClients();
    const running: ReturnType<typeof startRuntime>[] = [];
    const proofRoot = resolve(".tmp/project-service-runtime");
    await mkdir(proofRoot, { recursive: true });
    try {
      await restoreStoragePredecessor(pool);
      const target = randomUUID(),
        source = randomUUID(),
        org = randomUUID(),
        user = randomUUID();
      await seedOwnedProject({
        pool,
        projectId: target,
        organizationId: org,
        ownerUserId: user,
        organizationName: "Runtime fixture",
        organizationSlug: org,
        projectName: "System",
        projectSlug: target,
        organizationPlan: "team"
      });
      await pool.query(
        "INSERT INTO projects(id,organization_id,owner_user_id,name,slug,environment_default) VALUES($1::uuid,$2,$3,'Site',$1::text,'production')",
        [source, org, user]
      );
      const member = generateMemberToken(user),
        sourceToken = generateProjectToken(source),
        targetToken = generateProjectToken(target);
      await pool.query(
        "INSERT INTO member_tokens(id,user_id,organization_id,token_hash,label) VALUES($1,$2,$3,$4,'Runtime fixture')",
        [randomUUID(), user, org, member.hash]
      );
      for (const [id, token] of [
        [source, sourceToken],
        [target, targetToken]
      ] as const)
        await pool.query(
          "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Installed fixture')",
          [randomUUID(), id, token.hash]
        );
      expect((await migrateStorageSchema(createQueryable(pool))).applied).toHaveLength(2);
      expect(
        (await pool.query("SELECT scope_origin_ids FROM project_tokens ORDER BY id")).rows
      ).toEqual([{ scope_origin_ids: null }, { scope_origin_ids: null }]);
      const port = await runtimePort(),
        workerPort = await runtimePort(),
        base = `http://127.0.0.1:${port}`;
      const env = {
        ...process.env,
        HOME: clients.scratch,
        API_HOST: "127.0.0.1",
        API_PORT: String(port),
        WORKER_HEALTH_PORT: String(workerPort),
        WORKER_POLL_INTERVAL_MS: "100",
        PROJECT_MERGES_ENABLED: "true",
        DEBUGBUNDLE_PROBE_TRIGGER_SECRET: "runtime-fixture-only",
        ANALYTICS_HASH_SECRET: "runtime-fixture-only",
        AWS_ACCESS_KEY_ID: "test",
        AWS_SECRET_ACCESS_KEY: "test",
        AWS_EC2_METADATA_DISABLED: "true",
        SELFHOST_MODE: "true"
      };
      const api = startRuntime("api", env);
      running.push(api);
      let worker = startRuntime("worker", env);
      running.push(worker);
      await untilRuntime(
        () =>
          fetch(base + "/ready")
            .then((r) => r.ok)
            .catch(() => false),
        Boolean
      );
      await untilRuntime(
        () =>
          fetch(`http://127.0.0.1:${workerPort}/ready`)
            .then((r) => r.ok)
            .catch(() => false),
        Boolean
      );
      const auth = await clients.auth(base, member.plaintext);
      async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
        const response = await fetch(base + path, {
          method,
          headers: {
            authorization: `Bearer ${member.plaintext}`,
            ...(body === undefined ? {} : { "content-type": "application/json" })
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(10000)
        });
        if (!response.ok)
          throw new Error(
            `runtime_http_failed:${method}:${path}:${response.status}:${await response.text()}`
          );
        return response.json() as Promise<T>;
      }
      const sdkModule = (await import(
        pathToFileURL(join(clients.old, "node_modules/@debugbundle/sdk-node/dist/index.js")).href
      )) as {
        createDebugBundleSdk: () => {
          init: (config: {
            projectToken: string;
            service: string;
            environment: string;
            endpoint: string;
            projectMode: "connected";
            flushInterval: number;
            fetchImpl: typeof fetch;
          }) => void;
          captureException: (error: Error) => void;
          flush: () => Promise<void>;
          dispose: () => void;
        };
      };
      const configHeaders: string[] = [];
      async function capture(token: string, service: string, message: string) {
        const sdk = sdkModule.createDebugBundleSdk();
        sdk.init({
          projectToken: token,
          service,
          environment: "production",
          endpoint: base + "/v1/events",
          projectMode: "connected",
          flushInterval: 60000,
          fetchImpl: async (input, init) => {
            const response = await fetch(input, init);
            const url =
              typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (url.includes("/v1/sdk/config"))
              configHeaders.push(response.headers.get("cache-control") ?? "");
            return response;
          }
        });
        try {
          sdk.captureException(new Error(message));
          await sdk.flush();
        } finally {
          sdk.dispose();
        }
      }
      async function count(project: string): Promise<number> {
        return Number(
          (
            await pool.query("SELECT count(*)::int AS count FROM incidents WHERE project_id=$1", [
              project
            ])
          ).rows[0].count
        );
      }
      await capture(sourceToken.plaintext, "web", "Site before consolidation");
      await capture(targetToken.plaintext, "api", "API before consolidation");
      await untilRuntime(
        async () => [await count(source), await count(target)],
        (counts) => counts[0] === 1 && counts[1] === 1
      );
      const beforeIncident = (
        await pool.query("SELECT id FROM incidents WHERE project_id=$1", [source])
      ).rows[0].id as string;
      const originalBundle = await untilRuntime(
        () => request<Record<string, unknown>>(`/v1/incidents/${beforeIncident}/bundle`),
        (value) => value["status"] !== "pending"
      );
      const beforeObjects =
        (await s3.send(new ListObjectsV2Command({ Bucket: s3Bucket }))).Contents ?? [];
      const immutable = new Map<string, string>();
      for (const object of beforeObjects) {
        const bytes = await s3.send(new GetObjectCommand({ Bucket: s3Bucket, Key: object.Key! }));
        immutable.set(
          object.Key!,
          createHash("sha256")
            .update(await bytes.Body!.transformToByteArray())
            .digest("hex")
        );
      }
      expect(immutable.size).toBeGreaterThan(1);
      for (const root of [clients.old, clients.candidate]) {
        expect(
          await clients.cli(root, [
            "services",
            "--project-id",
            source,
            "--auth-file",
            auth,
            "--json"
          ])
        ).toMatchObject({ services: [{ name: "web" }] });
        expect(
          await clients.mcp(root, base, member.plaintext, "list_services", { projectId: source })
        ).toMatchObject({ services: [{ name: "web" }] });
      }
      const catalogue = await request<{ services: Array<{ service_definition_id: string }> }>(
        `/v1/projects/${source}/service-definitions`
      );
      const mergeRequest = {
        target_project_id: target,
        source_project_ids: [source],
        service_mappings: [
          {
            source_project_id: source,
            service_definition_id: catalogue.services[0]!.service_definition_id,
            name: "Site"
          }
        ]
      };
      const plan = await request<ProjectMergePlan>(
        "/v1/project-merges/preview",
        "POST",
        mergeRequest
      );
      expect(plan.ready).toBe(true);
      expect(
        await clients.mcp(clients.candidate, base, member.plaintext, "preview_project_merge", {
          request: mergeRequest
        })
      ).toMatchObject({ plan_digest: plan.plan_digest });
      const planPath = join(clients.scratch, "checked-plan.json");
      await writeFile(planPath, JSON.stringify(plan));
      const operation = (await clients.cli(clients.candidate, [
        "project",
        "merge",
        "apply",
        "--plan-file",
        planPath,
        "--idempotency-key",
        "runtime-rehearsal",
        "--auth-file",
        auth,
        "--json"
      ])) as ProjectMergeOperation;
      expect(operation.state).toBe("completed");
      expect(
        await clients.mcp(clients.candidate, base, member.plaintext, "get_project_merge", {
          operation_id: operation.operation_id
        })
      ).toMatchObject({
        state: "completed",
        local_adoption: "pending",
        deployed_runtime: "pending"
      });
      expect(
        await request(`/v1/project-merges/${operation.operation_id}/verification`)
      ).toMatchObject({ verified: true });
      await stopRuntime(worker.child);
      worker = startRuntime("worker", env);
      running.push(worker);
      await untilRuntime(
        () =>
          fetch(`http://127.0.0.1:${workerPort}/ready`)
            .then((r) => r.ok)
            .catch(() => false),
        Boolean
      );
      await capture(sourceToken.plaintext, "web", "Site after consolidation");
      const canonical = generateProjectToken(target);
      await pool.query(
        "INSERT INTO project_tokens(id,project_id,token_hash,label) VALUES($1,$2,$3,'Intentional new scope')",
        [randomUUID(), target, canonical.hash]
      );
      await capture(canonical.plaintext, "Site", "Canonical route after consolidation");
      await untilRuntime(
        () => count(source),
        (value) => value === 3
      );
      expect(await count(target)).toBe(1);
      expect(configHeaders.length).toBeGreaterThanOrEqual(2);
      expect(
        configHeaders.every((value) => value.includes("no-store") && value.includes("private"))
      ).toBe(true);
      for (const root of [clients.old, clients.candidate]) {
        expect(
          await clients.cli(root, [
            "services",
            "--project-id",
            target,
            "--auth-file",
            auth,
            "--json"
          ])
        ).toMatchObject({
          services: expect.arrayContaining([
            expect.objectContaining({ name: "Site" }),
            expect.objectContaining({ name: "api" })
          ])
        });
        expect(
          await clients.mcp(root, base, member.plaintext, "list_services", { projectId: source })
        ).toMatchObject({ services: [{ name: "web" }] });
      }
      expect(await request(`/v1/incidents/${beforeIncident}/bundle`)).toEqual(originalBundle);
      for (const [key, digest] of immutable) {
        const object = await s3.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key }));
        expect(
          createHash("sha256")
            .update(await object.Body!.transformToByteArray())
            .digest("hex")
        ).toBe(digest);
      }
      // Recreate a compatible API with apply disabled; committed aliases and
      // installed clients must remain readable after this runtime rollback.
      await stopRuntime(api.child);
      const rollback = startRuntime("api", { ...env, PROJECT_MERGES_ENABLED: "false" });
      running.push(rollback);
      await untilRuntime(
        () =>
          fetch(base + "/ready")
            .then((r) => r.ok)
            .catch(() => false),
        Boolean
      );
      expect(
        await clients.mcp(clients.old, base, member.plaintext, "list_services", {
          projectId: source
        })
      ).toMatchObject({ services: [{ name: "web" }] });
      expect(await request(`/v1/incidents/${beforeIncident}/bundle`)).toEqual(originalBundle);
      await stopRuntime(worker.child);
      await request(`/v1/projects/${target}`, "DELETE");
      expect(
        (await pool.query("SELECT id FROM projects WHERE id=ANY($1::uuid[])", [[target, source]]))
          .rows
      ).toEqual([]);
      expect(
        (await s3.send(new ListObjectsV2Command({ Bucket: s3Bucket }))).Contents ?? []
      ).toEqual([]);
      await writeFile(
        join(proofRoot, "receipt.json"),
        JSON.stringify(
          {
            artifacts: clients.proof,
            installed_clients: true,
            original_sdk_tokens: true,
            new_credential_scope: true,
            worker_restart: true,
            compatible_api_restart: true,
            immutable_objects: immutable.size,
            canonical_origin_cleanup: true
          },
          null,
          2
        ) + "\n"
      );
    } finally {
      for (const runtime of running.reverse()) await stopRuntime(runtime.child);
      await writeFile(
        join(proofRoot, "runtime.log"),
        running.map((runtime) => runtime.output()).join("\n")
      );
      await clients.close();
    }
  }, 180000);
});
