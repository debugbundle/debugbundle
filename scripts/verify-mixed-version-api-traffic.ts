import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { generateMemberToken, generateProjectToken } from "../packages/auth/src/index.js";
import { createAgentTokenStore } from "../packages/storage/src/agent-token-store.js";

const oldHost = process.env["MIXED_API_OLD_HOST"];
const newHost = process.env["MIXED_API_NEW_HOST"];
const bridgeHost = process.env["MIXED_API_BRIDGE_HOST"];
if (!oldHost || !newHost || !bridgeHost) throw new Error("mixed_api_hosts_required");

const pool = new Pool({
  host: process.env["DB_HOST"],
  port: Number(process.env["DB_PORT"] ?? "5432"),
  user: process.env["DB_USER"],
  password: process.env["DB_PASSWORD"],
  database: process.env["DB_NAME"]
});

async function expectStatus(
  label: string,
  host: string,
  path: string,
  token: string,
  expected: number,
  method = "GET",
  body?: object
): Promise<Response> {
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
  return response;
}

async function expectRuleActions(
  host: string,
  path: string,
  token: string,
  expected: string[]
): Promise<void> {
  const response = await expectStatus("capture_rules", host, path, token, 200);
  const body = (await response.json()) as { rules: { action: string }[] };
  const actions = body.rules.map((rule) => rule.action).sort();
  if (JSON.stringify(actions) !== JSON.stringify([...expected].sort())) {
    throw new Error("mixed_api_capture_rule_projection_mismatch");
  }
}

try {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  await pool.query("INSERT INTO organizations (id, name, slug) VALUES ($1, 'Mixed API', $2)", [
    organizationId,
    `mixed-${organizationId}`
  ]);
  await pool.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
    userId,
    `mixed-${userId}@example.invalid`
  ]);
  await pool.query(
    "INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, 'owner')",
    [randomUUID(), organizationId, userId]
  );
  for (const [id, slug] of [
    [projectId, "one"],
    [otherProjectId, "two"]
  ]) {
    await pool.query(
      "INSERT INTO projects (id, organization_id, owner_user_id, name, slug, environment_default) VALUES ($1, $2, $3, 'Mixed API', $4, 'production')",
      [id, organizationId, userId, slug]
    );
  }

  const member = generateMemberToken(userId);
  await pool.query(
    "INSERT INTO member_tokens (id, user_id, organization_id, token_hash, label) VALUES ($1, $2, $3, $4, 'mixed API')",
    [randomUUID(), userId, organizationId, member.hash]
  );
  const project = generateProjectToken(projectId);
  await pool.query(
    "INSERT INTO project_tokens (id, project_id, token_hash, label) VALUES ($1, $2, $3, 'mixed API')",
    [randomUUID(), projectId, project.hash]
  );
  const store = createAgentTokenStore({ query: (sql, params) => pool.query(sql, params) });
  const agent = await store.create({
    projectId,
    actorUserId: userId,
    label: "mixed API",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString()
  });
  if (agent === null) throw new Error("mixed_api_agent_seed_failed");

  for (const host of [oldHost, newHost]) {
    await expectStatus("member_read", host, "/v1/projects", member.plaintext, 200);
    await expectStatus("project_read", host, "/v1/sdk/config", project.plaintext, 200);
    await expectStatus("agent_not_member", host, "/v1/projects", agent.plaintext, 401);
    await expectStatus("agent_not_project", host, "/v1/sdk/config", agent.plaintext, 401);
  }
  await expectStatus(
    "agent_read",
    newHost,
    `/v1/agent/projects/${projectId}`,
    agent.plaintext,
    200
  );
  await expectStatus(
    "agent_other_project",
    newHost,
    `/v1/agent/projects/${otherProjectId}`,
    agent.plaintext,
    401
  );
  await expectStatus(
    "agent_no_mutation",
    newHost,
    "/v1/projects",
    agent.plaintext,
    401,
    "POST",
    {}
  );
  await expectStatus(
    "issuance_default_off",
    newHost,
    `/v1/projects/${projectId}/agent-tokens`,
    member.plaintext,
    503,
    "POST",
    { label: "must not issue" }
  );

  await store.revoke({ projectId, actorUserId: userId, tokenId: agent.token_id });
  await expectStatus(
    "revoked_agent",
    newHost,
    `/v1/agent/projects/${projectId}`,
    agent.plaintext,
    401
  );
  console.log("mixed_api_credential_compatibility_ok");

  const rulesPath = `/v1/projects/${projectId}/capture-rules`;
  await expectStatus("create_legacy_rule", oldHost, rulesPath, member.plaintext, 201, "POST", {
    name: "Legacy context rule",
    action: "demote",
    matcher: { services: ["legacy-service"] }
  });
  await expectRuleActions(oldHost, rulesPath, member.plaintext, ["demote"]);
  await expectRuleActions(newHost, `${rulesPath}?rule_schema=2`, member.plaintext, ["demote"]);

  const thresholdRule = {
    name: "Threshold rule",
    action: "threshold",
    matcher: { services: ["new-service"] },
    threshold_count: 2,
    threshold_window_seconds: 60,
    threshold_group_by: "fingerprint"
  };
  const paused = await expectStatus(
    "bridge_pauses_threshold_rules",
    bridgeHost,
    rulesPath,
    member.plaintext,
    503,
    "POST",
    thresholdRule
  );
  const pausedBody = (await paused.json()) as { error: string };
  if (pausedBody.error !== "capture_rule_v2_writes_paused")
    throw new Error("mixed_api_wrong_pause_reason");
  await expectRuleActions(oldHost, rulesPath, member.plaintext, ["demote"]);
  await expectStatus(
    "create_threshold_rule",
    newHost,
    rulesPath,
    member.plaintext,
    201,
    "POST",
    thresholdRule
  );
  await expectRuleActions(newHost, rulesPath, member.plaintext, ["demote"]);
  await expectRuleActions(newHost, `${rulesPath}?rule_schema=2`, member.plaintext, [
    "demote",
    "threshold"
  ]);
  await expectRuleActions(bridgeHost, `${rulesPath}?rule_schema=2`, member.plaintext, [
    "demote",
    "threshold"
  ]);
  console.log("mixed_api_capture_rule_client_compatibility_ok");
} finally {
  await pool.end();
}
