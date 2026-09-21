import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { generateMemberToken, generateProjectToken } from "../packages/auth/src/index.js";
import { createAgentTokenStore } from "../packages/storage/src/agent-token-store.js";

const oldHost = process.env["MIXED_API_OLD_HOST"];
const newHost = process.env["MIXED_API_NEW_HOST"];
if (!oldHost || !newHost) throw new Error("mixed_api_hosts_required");

const pool = new Pool({
  host: process.env["DB_HOST"],
  port: Number(process.env["DB_PORT"] ?? "5432"),
  user: process.env["DB_USER"],
  password: process.env["DB_PASSWORD"],
  database: process.env["DB_NAME"]
});

async function expectStatus(label: string, host: string, path: string, token: string,
  expected: number, method = "GET", body?: object): Promise<void> {
  const response = await fetch(`http://${host}:3000${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5_000)
  });
  if (response.status !== expected) {
    throw new Error(`mixed_api_status_mismatch:${label}:${response.status}`);
  }
}

try {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  await pool.query("INSERT INTO organizations (id, name, slug) VALUES ($1, 'Mixed API', $2)",
    [organizationId, `mixed-${organizationId}`]);
  await pool.query("INSERT INTO users (id, email) VALUES ($1, $2)",
    [userId, `mixed-${userId}@example.invalid`]);
  await pool.query("INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, 'owner')",
    [randomUUID(), organizationId, userId]);
  for (const [id, slug] of [[projectId, "one"], [otherProjectId, "two"]]) {
    await pool.query("INSERT INTO projects (id, organization_id, owner_user_id, name, slug, environment_default) VALUES ($1, $2, $3, 'Mixed API', $4, 'production')",
      [id, organizationId, userId, slug]);
  }

  const member = generateMemberToken(userId);
  await pool.query("INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label) VALUES ($1, $2, $3, $4, 'mixed API')",
    [randomUUID(), userId, organizationId, member.hash]);
  const project = generateProjectToken(projectId);
  await pool.query("INSERT INTO project_tokens (id, project_id, token_hash, label) VALUES ($1, $2, $3, 'mixed API')",
    [randomUUID(), projectId, project.hash]);
  const store = createAgentTokenStore({ query: (sql, params) => pool.query(sql, params) });
  const agent = await store.create({ projectId, actorUserId: userId, label: "mixed API",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  if (agent === null) throw new Error("mixed_api_agent_seed_failed");

  for (const host of [oldHost, newHost]) {
    await expectStatus("member_read", host, "/v1/projects", member.plaintext, 200);
    await expectStatus("project_read", host, "/v1/sdk/config", project.plaintext, 200);
    await expectStatus("agent_not_member", host, "/v1/projects", agent.plaintext, 401);
    await expectStatus("agent_not_project", host, "/v1/sdk/config", agent.plaintext, 401);
  }
  await expectStatus("agent_read", newHost, `/v1/agent/projects/${projectId}`, agent.plaintext, 200);
  await expectStatus("agent_other_project", newHost, `/v1/agent/projects/${otherProjectId}`, agent.plaintext, 401);
  await expectStatus("agent_no_mutation", newHost, "/v1/projects", agent.plaintext, 401, "POST", {});
  await expectStatus("issuance_default_off", newHost, `/v1/projects/${projectId}/agent-tokens`,
    member.plaintext, 503, "POST", { label: "must not issue" });

  await store.revoke({ projectId, actorUserId: userId, tokenId: agent.token_id });
  await expectStatus("revoked_agent", newHost, `/v1/agent/projects/${projectId}`, agent.plaintext, 401);
  console.log("mixed_api_credential_compatibility_ok");
} finally {
  await pool.end();
}
