import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const CONTRACT_PATH = new URL("../../contracts/public-interfaces.md", import.meta.url);

describe("retrieval parity mapping contract", () => {
  it("should keep bundle and reproduction retrieval mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain("| List incidents | `GET /v1/incidents` | `incidents` | `list_incidents` | |");
    expect(contract).toContain("| Get incident | `GET /v1/incidents/{id}` | `inspect` | `get_incident` | |");
    expect(contract).toContain("| Resolve incident | `POST /v1/incidents/{id}/resolve` | `resolve` | `resolve_incident` | Explicit user action |");
    expect(contract).toContain(
      "| Reopen incident | `POST /v1/incidents/{id}/reopen` | `reopen` | `reopen_incident` | Cloud incidents use the API route; local incidents still reopen directly from `.debugbundle/local/state.json` |"
    );
    expect(contract).toContain("| Get bundle | `GET /v1/incidents/{id}/bundle` | `bundle` | `get_bundle` | |");
    expect(contract).toContain(
      "| Get reproduction | `GET /v1/incidents/{id}/reproduction` | `reproduce` | `get_reproduction` | |"
    );
    expect(contract).toContain("| List services | `GET /v1/services` | `services` | `list_services` | |");
  });

  it("should keep logs retrieval mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain("| Get logs | `GET /v1/logs` | `logs` | `get_logs` | Query by incident_id |");
    expect(contract).toContain(
      "debugbundle_resolve_incident  → same result as POST /v1/incidents/{id}/resolve for cloud incidents; local state mutation for local incidents"
    );
    expect(contract).toContain(
      "debugbundle_reopen_incident   → same result as POST /v1/incidents/{id}/reopen for cloud incidents; local state mutation for local incidents"
    );
  });

  it("should keep setup and verification parity operations mapped across CLI and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain("| Doctor | — | `doctor` | `doctor` | CLI/MCP-only (local env) |");
    expect(contract).toContain("| Validate | — | `validate [--fix]` | `validate` | CLI/MCP-only (local env) |");
    expect(contract).toContain("| Verify local | — | `verify local` | `verify_local` | CLI/MCP-only (local env) |");
    expect(contract).toContain("| Verify cloud | — | `verify cloud` | `verify_cloud` | Uses API internally; `--trigger-5xx`/`trigger5xx` proves hosted 5xx incident creation and `--trigger-4xx <status>`/`trigger4xxStatus` proves configured hosted 4xx incident creation |");
    expect(contract).toContain("| Smoke test | — | `smoke` | `smoke` | CLI/MCP-only |");
    expect(contract).toContain("debugbundle_doctor            → same result as `debugbundle doctor --json`");
    expect(contract).toContain("debugbundle_validate          → same result as `debugbundle validate --json`");
    expect(contract).toContain("debugbundle_verify_local      → same result as `debugbundle verify local --json`");
    expect(contract).toContain("debugbundle_verify_cloud      → same result as `debugbundle verify cloud --json`");
    expect(contract).toContain("debugbundle_smoke             → same result as `debugbundle smoke --json`");
  });

  it("should keep local analysis parity mapped across CLI and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain("| Analyze (local) | — | `analyze` | `analyze` | CLI/MCP-only (local agent-driven) |");
    expect(contract).toContain("debugbundle_analyze           → same result as `debugbundle analyze --json`");
  });

  it("should keep token lifecycle operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| List project tokens | `GET /v1/projects/{id}/tokens` | `token project list` | `list_project_tokens` | Member token scoped to organization |"
    );
    expect(contract).toContain(
      "| Create project token | `POST /v1/projects/{id}/tokens` | `token project create` | `create_project_token` | Plaintext returned once |"
    );
    expect(contract).toContain(
      "| List member tokens | `GET /v1/member/tokens` | `token member list` | `list_member_tokens` | Member token scoped to caller |"
    );
  });

  it("should keep webhook lifecycle operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| List webhooks | `GET /v1/webhooks` | `webhook list` | `list_webhooks` | Browser Session or Member Token, scoped to organization/project |"
    );
    expect(contract).toContain(
      "| Create webhook | `POST /v1/webhooks` | `webhook create` | `create_webhook` | Signing secret returned once |"
    );
    expect(contract).toContain(
      "| Update webhook | `PATCH /v1/webhooks/{id}` | `webhook update` | `update_webhook` | |"
    );
    expect(contract).toContain(
      "| Delete webhook | `DELETE /v1/webhooks/{id}` | `webhook delete` | `delete_webhook` | |"
    );
    expect(contract).toContain(
      "| Test webhook | `POST /v1/webhooks/{id}/test` | `webhook test` | `test_webhook` | Queues a signed synthetic delivery |"
    );
    expect(contract).toContain(
      "| Webhook deliveries | `GET /v1/webhooks/{id}/deliveries` | `webhook deliveries` | `list_webhook_deliveries` | Statuses: pending, retrying, delivered, failed, disabled |"
    );
    expect(contract).toContain("debugbundle_list_webhooks          → same result as `GET /v1/webhooks`");
    expect(contract).toContain("debugbundle_create_webhook         → same result as `POST /v1/webhooks`");
    expect(contract).toContain("debugbundle_update_webhook         → same result as `PATCH /v1/webhooks/{id}`");
    expect(contract).toContain("debugbundle_delete_webhook         → same result as `DELETE /v1/webhooks/{id}`");
    expect(contract).toContain("debugbundle_test_webhook           → same result as `POST /v1/webhooks/{id}/test`");
    expect(contract).toContain("debugbundle_list_webhook_deliveries → same result as `GET /v1/webhooks/{id}/deliveries`");
  });

  it("should keep alert lifecycle operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| Alert CRUD | `POST/GET/PATCH/DELETE /v1/alerts` | `alert list/create/update/delete` | `list_alerts/create_alert/update_alert/delete_alert` | Browser Session or Member Token, scoped to organization/project |"
    );
    expect(contract).toContain("debugbundle_list_alerts          → same result as `GET /v1/alerts`");
    expect(contract).toContain("debugbundle_create_alert         → same result as `POST /v1/alerts`");
    expect(contract).toContain("debugbundle_update_alert         → same result as `PATCH /v1/alerts/{id}`");
    expect(contract).toContain("debugbundle_delete_alert         → same result as `DELETE /v1/alerts/{id}`");
  });

  it("should keep weekly report channel lifecycle operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| Weekly report channel CRUD | `POST/GET/PATCH/DELETE /v1/weekly-report-channels` | `weekly-report list/create/update/delete` | `list_weekly_report_channels/create_weekly_report_channel/update_weekly_report_channel/delete_weekly_report_channel` | Browser Session or Member Token, scoped to organization/project |"
    );
    expect(contract).toContain("debugbundle_list_weekly_report_channels   → same result as `GET /v1/weekly-report-channels`");
    expect(contract).toContain("debugbundle_create_weekly_report_channel  → same result as `POST /v1/weekly-report-channels`");
    expect(contract).toContain("debugbundle_update_weekly_report_channel  → same result as `PATCH /v1/weekly-report-channels/{id}`");
    expect(contract).toContain("debugbundle_delete_weekly_report_channel  → same result as `DELETE /v1/weekly-report-channels/{id}`");
  });

  it("should keep remote probe parity operations and sdk config documented", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| Activate probes (remote) | `POST /v1/projects/{id}/probes/activate` | `probe activate` | `activate_probe` | Browser Session or Member Token, Solo+ only |"
    );
    expect(contract).toContain(
      "| List active probes (remote) | `GET /v1/projects/{id}/probes` | `probe list` | `list_active_probes` | Solo+ only |"
    );
    expect(contract).toContain(
      "| Deactivate probes (remote) | `POST /v1/projects/{id}/probes/deactivate` | `probe deactivate` | `deactivate_probe` | Solo+ only |"
    );
    expect(contract).toContain(
      "| SDK config | `GET /v1/sdk/config` | — | — | SDK-only (project token, includes resolved capture policy) |"
    );
  });

  it("should keep project lifecycle operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| List projects | `GET /v1/projects` | `project list` | `list_projects` | Browser Session or Member Token, scoped to member organization |"
    );
    expect(contract).toContain(
      "| Create project | `POST /v1/projects` | `project create` | `create_project` | Browser Session or Member Token, owner only |"
    );
    expect(contract).toContain(
      "| Update project | `PATCH /v1/projects/{id}` | `project update` | `update_project` | Browser Session or Member Token, owner only |"
    );
    expect(contract).toContain(
      "| Delete project | `DELETE /v1/projects/{id}` | `project delete` | `delete_project` | Browser Session or Member Token, owner only |"
    );
  });

  it("should keep github automation slice-one operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| Get GitHub installation | `GET /v1/github/installation` | `github status` | `get_github_status` | Browser Session or Member Token, Solo+ only |"
    );
    expect(contract).toContain(
      "| List GitHub repositories | `GET /v1/github/repositories` | `github repos` | `list_github_repositories` | Browser Session or Member Token, Solo+ only |"
    );
    expect(contract).toContain(
      "| Set project GitHub repo | `PUT /v1/projects/{id}/github/repo` | `github repo set` | `set_project_github_repo` | Browser Session or Member Token, owner only, Solo+ only |"
    );
    expect(contract).toContain(
      "| Remove project GitHub repo | `DELETE /v1/projects/{id}/github/repo` | `github repo remove` | `remove_project_github_repo` | Browser Session or Member Token, owner only, Solo+ only |"
    );
    expect(contract).toContain("debugbundle_get_github_status           → same result as GET /v1/github/installation");
    expect(contract).toContain("debugbundle_list_github_repositories    → same result as GET /v1/github/repositories");
    expect(contract).toContain("debugbundle_set_project_github_repo     → same result as PUT /v1/projects/{id}/github/repo");
    expect(contract).toContain("debugbundle_remove_project_github_repo  → same result as DELETE /v1/projects/{id}/github/repo");
  });

  it("should keep github automation rule operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| List dispatch rules | `GET /v1/projects/{id}/github/rules` | `github rules` | `list_github_dispatch_rules` | Browser Session or Member Token, Solo+ only |"
    );
    expect(contract).toContain(
      "| Create dispatch rule | `POST /v1/projects/{id}/github/rules` | `github rules create` | `create_github_dispatch_rule` | Browser Session or Member Token, owner only, Solo+ only |"
    );
    expect(contract).toContain(
      "| Update dispatch rule | `PATCH /v1/projects/{id}/github/rules/{ruleId}` | `github rules update` | `update_github_dispatch_rule` | Browser Session or Member Token, owner only, Solo+ only |"
    );
    expect(contract).toContain(
      "| Delete dispatch rule | `DELETE /v1/projects/{id}/github/rules/{ruleId}` | `github rules delete` | `delete_github_dispatch_rule` | Browser Session or Member Token, owner only, Solo+ only |"
    );
    expect(contract).toContain("debugbundle_list_github_dispatch_rules  → same result as GET /v1/projects/{id}/github/rules");
    expect(contract).toContain("debugbundle_create_github_dispatch_rule → same result as POST /v1/projects/{id}/github/rules");
    expect(contract).toContain("debugbundle_update_github_dispatch_rule → same result as PATCH /v1/projects/{id}/github/rules/{ruleId}");
    expect(contract).toContain("debugbundle_delete_github_dispatch_rule → same result as DELETE /v1/projects/{id}/github/rules/{ruleId}");
  });

  it("should keep github delivery operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| List dispatch deliveries | `GET /v1/projects/{id}/github/deliveries` | `github deliveries` | `list_github_deliveries` | Browser Session or Member Token, Solo+ only |"
    );
    expect(contract).toContain(
      "| Retry dispatch delivery | `POST /v1/projects/{id}/github/deliveries/{id}/retry` | `github deliveries retry` | `retry_github_delivery` | Browser Session or Member Token, Solo+ only |"
    );
    expect(contract).toContain("debugbundle_list_github_deliveries      → same result as GET /v1/projects/{id}/github/deliveries");
    expect(contract).toContain("debugbundle_retry_github_delivery       → same result as POST /v1/projects/{id}/github/deliveries/{id}/retry");
    expect(contract).toContain("debugbundle github deliveries retry <delivery-id> [--project-id <id>] [--auth-file <path>] [--json]");
  });

  it("should keep billing operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| Get billing summary | `GET /v1/billing` | `billing get` | `get_billing_summary` | Browser Session or Member Token, owner only |"
    );
    expect(contract).toContain(
      "| Increase capacity now | `POST /v1/billing/capacity/increase` | `billing capacity increase` | `increase_capacity` |"
    );
    expect(contract).toContain(
      "| Schedule capacity reduction | `POST /v1/billing/capacity/scheduled-reduction` | `billing capacity schedule-reduction` | `schedule_capacity_reduction` |"
    );
    expect(contract).toContain(
      "| Cancel scheduled capacity reduction | `DELETE /v1/billing/capacity/scheduled-reduction` | `billing capacity cancel-reduction` | `cancel_capacity_reduction` |"
    );
  });

  it("should keep member operations mapped across API, CLI, and MCP", async (): Promise<void> => {
    const contract = await readFile(CONTRACT_PATH, "utf8");

    expect(contract).toContain(
      "| List organization members | `GET /v1/organization/members` | `member list` | `list_members` | Browser Session or Member Token, owner only |"
    );
    expect(contract).toContain(
      "| List pending organization invites | `GET /v1/organization/members/invites` | `member invites` | `list_member_invites` | Browser Session or Member Token, owner only |"
    );
    expect(contract).toContain(
      "| Invite organization member | `POST /v1/organization/members/invite` | `member invite` | `invite_member` | Browser Session or Member Token, owner only, Team tier |"
    );
    expect(contract).toContain(
      "| Cancel organization invite | `DELETE /v1/organization/members/invites/{inviteId}` | `member cancel-invite` | `cancel_member_invite` | Browser Session or Member Token, owner only |"
    );
    expect(contract).toContain(
      "| Update organization member role | `PATCH /v1/organization/members/{userId}` | `member update-role` | `update_member_role` | Browser Session or Member Token, owner only |"
    );
    expect(contract).toContain(
      "| Remove organization member | `DELETE /v1/organization/members/{userId}` | `member remove` | `remove_member` | Browser Session or Member Token, owner only |"
    );
  });
});
