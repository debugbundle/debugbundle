import memberTokenAdditions from "../../fixtures/mcp/member-token-additions.json" with { type: "json" };
import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  DEBUGBUNDLE_OPENCLAW_TOOL_MAP,
  DEBUGBUNDLE_OPENCLAW_TOOL_NAMES
} from "../../../apps/openclaw-plugin/src/index.js";
import { createMcpServer } from "../../../apps/mcp/src/server.js";

const legacyContractPath = new URL(
  "../../fixtures/mcp/legacy-stdio-openclaw-contract.json",
  import.meta.url
);

type PolicySchema = {
  properties: { update: { properties: Record<string, unknown>; required?: string[] } };
};

function addOptionalDiagnosticPolicy(schema: PolicySchema): void {
  // FR-EVID-05: this sole additive input is optional. The frozen fixture still
  // protects every existing policy field and the remaining tool contracts.
  expect(schema.properties.update.properties).not.toHaveProperty("capture_diagnostic_context");
  schema.properties.update.properties["capture_diagnostic_context"] = {
    description:
      "Enable standalone diagnostic context, disable it, or restore preset defaults with null. Minimal policy always disables it; SDK opt-in and verified path support remain required.",
    type: ["boolean", "null"]
  };
}

function discloseConnectedDoctor(tool: { description: string }): void {
  // Connected doctor already performs health/auth reads. Correct only its
  // incomplete metadata; retain the historical schema, name and approval flags.
  expect(tool.description).toBe("Run local DebugBundle environment diagnostics.");
  tool.description =
    "Run DebugBundle environment diagnostics. Connected mode checks API health and saved member authentication with one incident request restricted to the connected project; incident contents are not returned.";
}

function addOptionalProjectInputs(name: string, schema: unknown): void {
  // FR-PJS: allow only these documented optional extensions. The historical
  // fixture continues to protect every old field, required list and annotation.
  const scope = { const: "current_project", type: "string" };
  const uuid = { format: "uuid", type: "string" };
  const additions: Record<string, Record<string, unknown>> = {
    update_github_dispatch_rule: { projectScope: scope },
    update_webhook: { projectScope: scope },
    update_alert: { projectScope: scope },
    // FR-ALT-03 / AC-ALT-SCOPE: opt-in read metadata leaves every old call and
    // default response unchanged. Keep the frozen fixture itself intact.
    list_alerts: {
      includeScope: {
        type: "boolean",
        description:
          "Include saved origin/service scope and the selected service/environment filter."
      }
    },
    list_projects: { projectId: uuid },
    activate_probe: {
      sdkProjectId: uuid,
      sdkTokenId: uuid,
      sdkService: { maxLength: 200, minLength: 1, type: "string" }
    },
    list_services: { offset: { maximum: 100000, minimum: 0, type: "integer" } }
  };
  const target = schema as { properties: Record<string, unknown>; required?: string[] };
  for (const [field, definition] of Object.entries(additions[name] ?? {})) {
    expect(target.properties).not.toHaveProperty(field);
    expect(target.required ?? []).not.toContain(field);
    target.properties[field] = definition;
  }
}

describe("legacy MCP and OpenClaw contract", () => {
  it("preserves the frozen stdio and OpenClaw public surface as tools are added", async () => {
    const expected = JSON.parse(await readFile(legacyContractPath, "utf8")) as {
      initialization: { result: { serverInfo: { version: string } } };
      tools: {
        result: { tools: Array<{ name: string; description: string; inputSchema: PolicySchema }> };
      };
      openClaw: {
        names: string[];
        tools: Array<{
          openClawToolName: string;
          description: string;
          optional: boolean;
          parameters: PolicySchema;
        }>;
      };
    };
    discloseConnectedDoctor(expected.tools.result.tools.find((tool) => tool.name === "doctor")!);
    discloseConnectedDoctor(
      expected.openClaw.tools.find((tool) => tool.openClawToolName === "debugbundle_doctor")!
    );
    // AC-OPENCLAW-02 security correction: retain the historical fixture and
    // permit only these two default-exposure changes, not schema/catalog drift.
    for (const tool of expected.openClaw.tools) {
      if (
        ["debugbundle_create_agent_token", "debugbundle_revoke_agent_token"].includes(
          tool.openClawToolName
        )
      ) {
        expect(tool.optional).toBe(false);
        tool.optional = true;
      }
    }
    addOptionalDiagnosticPolicy(
      expected.tools.result.tools.find((tool) => tool.name === "update_capture_policy")!.inputSchema
    );
    addOptionalDiagnosticPolicy(
      expected.openClaw.tools.find(
        (tool) => tool.openClawToolName === "debugbundle_update_capture_policy"
      )!.parameters
    );
    for (const tool of expected.tools.result.tools)
      addOptionalProjectInputs(tool.name, tool.inputSchema);
    for (const tool of expected.openClaw.tools)
      addOptionalProjectInputs(tool.openClawToolName.replace(/^debugbundle_/, ""), tool.parameters);
    // FR-BUS-07 extends only this existing selection; old choices and required
    // fields remain identical in both ordinary automation interfaces.
    for (const schema of [
      expected.tools.result.tools.find((tool) => tool.name === "start_trial")!.inputSchema,
      expected.openClaw.tools.find((tool) => tool.openClawToolName === "debugbundle_start_trial")!
        .parameters
    ] as unknown as Array<{ properties: { targetPlan: { enum: string[] } } }>) {
      expect(schema.properties.targetPlan.enum).toEqual(["solo", "team"]);
      schema.properties.targetPlan.enum.push("business");
    }
    // FR-BUS-03 permits only these optional inputs; all frozen required fields,
    // historical names, envelopes and approval annotations remain protected.
    for (const [name, fields] of Object.entries(memberTokenAdditions)) {
      const stdio = expected.tools.result.tools.find((tool) => tool.name === name)!;
      const claw = expected.openClaw.tools.find(
        (tool) => tool.openClawToolName === `debugbundle_${name}`
      )!;
      for (const schema of [stdio.inputSchema, claw.parameters] as unknown as Array<{
        properties: Record<string, unknown>;
        required?: string[];
      }>) {
        for (const [field, definition] of Object.entries(fields)) {
          expect(schema.properties).not.toHaveProperty(field);
          expect(schema.required ?? []).not.toContain(field);
          schema.properties[field] = definition;
        }
      }
      if (name === "create_member_token") {
        for (const tool of [stdio, claw]) {
          expect(tool.description).toBe("Create a new member token.");
          tool.description =
            "Create a member token. New restricted scope requires verified interactive issuance; restricted credentials cannot mint credentials.";
        }
      }
    }
    const successfulServer = createMcpServer({
      tools: {
        doctor: vi.fn().mockResolvedValue({ status: "healthy" })
      }
    });
    const failingServer = createMcpServer({
      tools: {
        doctor: vi.fn().mockRejectedValue(new Error("legacy_failure"))
      }
    });

    const actual = {
      initialization: await successfulServer.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize"
      }),
      tools: await successfulServer.handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      successEnvelope: await successfulServer.handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "doctor", arguments: {} }
      }),
      errorEnvelope: await failingServer.handleRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "doctor", arguments: {} }
      }),
      openClaw: {
        names: DEBUGBUNDLE_OPENCLAW_TOOL_NAMES,
        tools: DEBUGBUNDLE_OPENCLAW_TOOL_MAP
      },
      compatibility: {
        authenticationPrecedence: [
          "explicit_bearer_token",
          "environment_member_token",
          "cli_auth_state"
        ],
        retrievalSourceAliases: ["local", "cloud"]
      }
    };

    const toolsResponse = actual.tools as { result: { tools: Array<{ name: string }> } };
    const initialization = actual.initialization as {
      result: { serverInfo: { version: string } };
    };
    const mcpPackage = JSON.parse(
      await readFile(new URL("../../../apps/mcp/package.json", import.meta.url), "utf8")
    ) as { version: string };
    expect(initialization.result.serverInfo.version).toBe(mcpPackage.version);
    const legacyToolNames = new Set(expected.tools.result.tools.map((tool) => tool.name));
    const legacyOpenClawNames = new Set(expected.openClaw.names);
    expect({
      ...actual,
      initialization: {
        ...initialization,
        result: {
          ...initialization.result,
          serverInfo: {
            ...initialization.result.serverInfo,
            version: expected.initialization.result.serverInfo.version
          }
        }
      },
      tools: {
        ...toolsResponse,
        result: {
          tools: toolsResponse.result.tools.filter((tool) => legacyToolNames.has(tool.name))
        }
      },
      openClaw: {
        names: actual.openClaw.names.filter((name) => legacyOpenClawNames.has(name)),
        tools: actual.openClaw.tools.filter((tool) =>
          legacyOpenClawNames.has(tool.openClawToolName)
        )
      }
    }).toEqual(expected);
    expect(toolsResponse.result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "list_alert_groups",
        "get_alert_group",
        "rotate_alert_webhook_secret"
      ])
    );
    expect(actual.openClaw.names).toEqual(
      expect.arrayContaining([
        "debugbundle_list_alert_groups",
        "debugbundle_get_alert_group",
        "debugbundle_rotate_alert_webhook_secret"
      ])
    );
  });
});
