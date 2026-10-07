import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorCommand as realDoctorCommand } from "../../../apps/cli/src/doctor-command.js";
import { validateCommand as realValidateCommand } from "../../../apps/cli/src/validate-command.js";
import { verifyCloudCommand as realVerifyCloudCommand } from "../../../apps/cli/src/verify-command.js";
import { MCP_TOOL_CATALOG } from "../../../apps/mcp/src/tool-catalog.js";
import { LOCAL_AUTH_MCP_TOOL_CATALOG } from "../../../apps/mcp/src/local-auth-catalog.js";
import { createMcpServer } from "../../../apps/mcp/src/server.js";

import { SETUP_MCP_TOOL_NAMES, createSetupMcpTools } from "../../../apps/mcp/src/setup-tools.js";

describe("mcp setup tools", () => {
  it.each([
    { projectId: "proj_123", service: "checkout-api" },
    { projectId: "proj_123", traceId: "synthetic-trace" },
    { projectId: "proj_123", requestId: "synthetic-request" },
    {
      projectId: "proj_123",
      service: "api",
      traceId: "synthetic-trace",
      requestId: "synthetic-request",
      environment: "staging",
      maxAgeMinutes: 20,
      authFilePath: "/tmp/synthetic-auth.json"
    }
  ])(
    "preserves real-app proof options through the public catalog and adapter: %j",
    async (input) => {
      const verifyCloudCommand = vi.fn().mockResolvedValue({ output: '{"status":"healthy"}' });
      const tools = createSetupMcpTools({
        doctorCommand: vi.fn(),
        validateCommand: vi.fn(),
        verifyLocalCommand: vi.fn(),
        verifyCloudCommand,
        smokeCommand: vi.fn()
      });
      const descriptor = MCP_TOOL_CATALOG.find((tool) => tool.name === "verify_app_event")!;
      expect(descriptor).toBeDefined();
      const parsed = descriptor.inputSchema.parse(input);
      expect(parsed).toEqual(input);
      expect(
        LOCAL_AUTH_MCP_TOOL_CATALOG.find(
          (tool) => tool.name === "verify_app_event"
        )!.inputSchema.parse(input)
      ).toEqual(input);
      await expect(tools.verify_app_event(parsed)).resolves.toEqual({ status: "healthy" });
      expect(verifyCloudCommand).toHaveBeenCalledWith({
        ...input,
        expectAppEvent: true,
        json: true
      });
    }
  );

  it.each([false, true])(
    "exposes app-event proof through the server without allowing synthetic mode injection (local-auth: %s)",
    async (localAuth) => {
      const verifyCloudCommand = vi.fn().mockResolvedValue({ output: '{"status":"healthy"}' });
      const tools = createSetupMcpTools({
        doctorCommand: vi.fn(),
        validateCommand: vi.fn(),
        verifyLocalCommand: vi.fn(),
        verifyCloudCommand,
        smokeCommand: vi.fn()
      });
      const server = createMcpServer({ tools, localAuth });
      const call = (args: Record<string, unknown>) =>
        server.handleRequest({
          id: 1,
          method: "tools/call",
          params: { name: "verify_app_event", arguments: args }
        });
      await expect(
        call({ projectId: "proj_123", service: "api", trigger5xx: true })
      ).resolves.toMatchObject({ error: { code: -32602 } });
      expect(verifyCloudCommand).not.toHaveBeenCalled();
      await expect(
        call({ projectId: "proj_123", traceId: "synthetic-trace" })
      ).resolves.toMatchObject({ result: { content: [{ text: '{"status":"healthy"}' }] } });
      expect(verifyCloudCommand).toHaveBeenCalledWith({
        projectId: "proj_123",
        traceId: "synthetic-trace",
        expectAppEvent: true,
        json: true
      });
    }
  );

  it("retains shared CLI validation for unscoped app-event proof before authentication", async () => {
    const readAuthState = vi.fn();
    const tools = createSetupMcpTools({
      doctorCommand: vi.fn(),
      validateCommand: vi.fn(),
      verifyLocalCommand: vi.fn(),
      verifyCloudCommand: (input) => realVerifyCloudCommand(input, { readAuthState }),
      smokeCommand: vi.fn()
    });
    await expect(tools.verify_app_event({ projectId: "proj_123" })).resolves.toMatchObject({
      status: "error",
      checks: [expect.objectContaining({ name: "trigger-input", status: "error" })]
    });
    expect(readAuthState).not.toHaveBeenCalled();
  });

  it.each([
    { projectId: "proj_123" },
    { projectId: "proj_123", traceId: "" },
    { projectId: "proj_123", traceId: "   " },
    { projectId: "proj_123", service: "api", trigger5xx: true },
    { projectId: "proj_123", service: "api", trigger4xxStatus: 404 },
    { projectId: "proj_123", service: "api", expectAppEvent: false }
  ])("rejects unscoped or synthetic mode injection in the app-event catalog: %j", (input) => {
    for (const catalog of [MCP_TOOL_CATALOG, LOCAL_AUTH_MCP_TOOL_CATALOG]) {
      const descriptor = catalog.find((tool) => tool.name === "verify_app_event")!;
      expect(descriptor).toBeDefined();
      expect(descriptor.inputSchema.safeParse(input).success).toBe(false);
    }
  });

  it("preserves actionable local setup errors through the real CLI adapters", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-agent-setup-"));
    try {
      await mkdir(join(root, ".debugbundle"));
      await writeFile(join(root, ".debugbundle/agent-setup.json"), '{"version":999}');
      const tools = createSetupMcpTools({
        doctorCommand: (input) =>
          realDoctorCommand(input, {
            cwd: () => root,
            readAuthState: async () => {
              throw new Error("Not logged in.");
            }
          }),
        validateCommand: (input) => realValidateCommand(input, { cwd: () => root }),
        verifyLocalCommand: vi.fn(),
        verifyCloudCommand: vi.fn(),
        smokeCommand: vi.fn()
      });
      for (const command of ["doctor", "validate"] as const) {
        await expect(tools[command]({})).resolves.toMatchObject({
          status: "error",
          errors: expect.arrayContaining([expect.stringMatching(/agent.setup|metadata/i)])
        });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("declares setup and verification tool parity", () => {
    expect(SETUP_MCP_TOOL_NAMES).toEqual([
      "doctor",
      "validate",
      "verify_local",
      "verify_cloud",
      "verify_app_event",
      "smoke"
    ]);
  });

  it("returns parsed doctor and validate payloads", async () => {
    const doctorCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        status: "healthy",
        checks: [{ name: "profile", status: "ok", message: "Found .debugbundle/profile.json" }],
        warnings: [],
        errors: [],
        suggested_actions: ["Run debugbundle login to create ~/.debugbundle/auth.json."],
        auto_fix_available: false
      })
    });
    const validateCommand = vi.fn().mockResolvedValue({
      exitCode: 4,
      output: JSON.stringify({
        status: "error",
        checks: [
          {
            name: "profile-schema",
            status: "error",
            message: "Profile validation failed with 1 errors."
          }
        ],
        warnings: [],
        errors: [".debugbundle/profile.json: Missing .debugbundle/profile.json"],
        suggested_actions: ["Run debugbundle setup if .debugbundle/profile.json is missing."],
        auto_fix_available: true
      })
    });

    const tools = createSetupMcpTools({
      doctorCommand,
      validateCommand,
      verifyLocalCommand: vi.fn(),
      verifyCloudCommand: vi.fn(),
      smokeCommand: vi.fn()
    });

    await expect(
      tools.doctor({
        authFilePath: "/tmp/auth.json",
        privacy: true
      })
    ).resolves.toEqual({
      status: "healthy",
      checks: [{ name: "profile", status: "ok", message: "Found .debugbundle/profile.json" }],
      warnings: [],
      errors: [],
      suggested_actions: ["Run debugbundle login to create ~/.debugbundle/auth.json."],
      auto_fix_available: false
    });
    expect(doctorCommand).toHaveBeenCalledWith({
      authFilePath: "/tmp/auth.json",
      privacy: true,
      json: true
    });

    await expect(
      tools.validate({
        fix: true
      })
    ).resolves.toEqual({
      status: "error",
      checks: [
        {
          name: "profile-schema",
          status: "error",
          message: "Profile validation failed with 1 errors."
        }
      ],
      warnings: [],
      errors: [".debugbundle/profile.json: Missing .debugbundle/profile.json"],
      suggested_actions: ["Run debugbundle setup if .debugbundle/profile.json is missing."],
      auto_fix_available: true
    });
    expect(validateCommand).toHaveBeenCalledWith({
      fix: true,
      json: true
    });
  });

  it("returns parsed verification and smoke payloads", async () => {
    const verifyLocalCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        status: "healthy",
        checks: [
          {
            name: "bundle-retrieval",
            status: "ok",
            message: "Retrieved bundle for incident inc_verify_123."
          }
        ],
        warnings: [],
        errors: [],
        suggested_actions: [
          "Review incident inc_verify_123 if you want to inspect the verification bundle."
        ],
        auto_fix_available: false
      })
    });
    const verifyCloudCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      output: JSON.stringify({
        status: "error",
        checks: [
          {
            name: "passive-traffic-check",
            status: "error",
            message:
              "Latest production incident inc_prod_123 is older than the 15 minute verification window."
          }
        ],
        warnings: [],
        errors: [
          "Latest production incident inc_prod_123 is older than the 15 minute verification window."
        ],
        suggested_actions: [
          "Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."
        ],
        auto_fix_available: false
      })
    });
    const smokeCommand = vi.fn().mockResolvedValue({
      exitCode: 2,
      output: JSON.stringify({
        status: "error",
        checks: [
          { name: "cloud-verification", status: "error", message: "Cloud verification failed." }
        ],
        warnings: [],
        errors: ["cloud: Not logged in."],
        suggested_actions: [
          "Run debugbundle verify cloud to inspect hosted traffic verification in detail."
        ],
        auto_fix_available: false
      })
    });

    const tools = createSetupMcpTools({
      doctorCommand: vi.fn(),
      validateCommand: vi.fn(),
      verifyLocalCommand,
      verifyCloudCommand,
      smokeCommand
    });

    await expect(
      tools.verify_local({
        authFilePath: "/tmp/auth.json"
      })
    ).resolves.toEqual({
      status: "healthy",
      checks: [
        {
          name: "bundle-retrieval",
          status: "ok",
          message: "Retrieved bundle for incident inc_verify_123."
        }
      ],
      warnings: [],
      errors: [],
      suggested_actions: [
        "Review incident inc_verify_123 if you want to inspect the verification bundle."
      ],
      auto_fix_available: false
    });
    expect(verifyLocalCommand).toHaveBeenCalledWith({
      json: true
    });

    await expect(
      tools.verify_cloud({
        projectId: "proj_123",
        service: "checkout-api",
        environment: "production",
        maxAgeMinutes: 20,
        trigger5xx: true,
        authFilePath: "/tmp/auth.json"
      })
    ).resolves.toEqual({
      status: "error",
      checks: [
        {
          name: "passive-traffic-check",
          status: "error",
          message:
            "Latest production incident inc_prod_123 is older than the 15 minute verification window."
        }
      ],
      warnings: [],
      errors: [
        "Latest production incident inc_prod_123 is older than the 15 minute verification window."
      ],
      suggested_actions: [
        "Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."
      ],
      auto_fix_available: false
    });
    expect(verifyCloudCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      service: "checkout-api",
      environment: "production",
      maxAgeMinutes: 20,
      trigger5xx: true,
      authFilePath: "/tmp/auth.json",
      json: true
    });

    await expect(
      tools.verify_cloud({
        projectId: "proj_123",
        trigger4xxStatus: 403
      })
    ).resolves.toEqual({
      status: "error",
      checks: [
        {
          name: "passive-traffic-check",
          status: "error",
          message:
            "Latest production incident inc_prod_123 is older than the 15 minute verification window."
        }
      ],
      warnings: [],
      errors: [
        "Latest production incident inc_prod_123 is older than the 15 minute verification window."
      ],
      suggested_actions: [
        "Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."
      ],
      auto_fix_available: false
    });
    expect(verifyCloudCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      trigger4xxStatus: 403,
      json: true
    });

    await expect(
      tools.smoke({
        projectId: "proj_123",
        service: "checkout-api",
        environment: "production",
        maxAgeMinutes: 20,
        authFilePath: "/tmp/auth.json"
      })
    ).resolves.toEqual({
      status: "error",
      checks: [
        { name: "cloud-verification", status: "error", message: "Cloud verification failed." }
      ],
      warnings: [],
      errors: ["cloud: Not logged in."],
      suggested_actions: [
        "Run debugbundle verify cloud to inspect hosted traffic verification in detail."
      ],
      auto_fix_available: false
    });
    expect(smokeCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      service: "checkout-api",
      environment: "production",
      maxAgeMinutes: 20,
      authFilePath: "/tmp/auth.json",
      json: true
    });
  });

  it("maps invalid wrapped command output to mcp_tool_error:unknown_error", async () => {
    const tools = createSetupMcpTools({
      doctorCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: "not-json"
      }),
      validateCommand: vi.fn(),
      verifyLocalCommand: vi.fn(),
      verifyCloudCommand: vi.fn(),
      smokeCommand: vi.fn()
    });

    await expect(tools.doctor({})).rejects.toThrow("mcp_tool_error:unknown_error");
  });

  it("supports minimal inputs and maps wrapped command failures to mcp_tool_error:unknown_error", async () => {
    const verifyLocalCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        status: "healthy"
      })
    });
    const smokeCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        status: "healthy"
      })
    });
    const tools = createSetupMcpTools({
      doctorCommand: vi.fn(),
      validateCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        output: JSON.stringify({ status: "healthy" })
      }),
      verifyLocalCommand,
      verifyCloudCommand: vi.fn().mockRejectedValue(new Error("verify_failed")),
      smokeCommand
    });

    await expect(tools.validate({})).resolves.toEqual({ status: "healthy" });
    await expect(tools.verify_local({})).resolves.toEqual({ status: "healthy" });
    await expect(tools.smoke({ projectId: "proj_123" })).resolves.toEqual({ status: "healthy" });
    expect(verifyLocalCommand).toHaveBeenCalledWith({
      json: true
    });
    expect(smokeCommand).toHaveBeenCalledWith({
      projectId: "proj_123",
      json: true
    });
    await expect(tools.verify_cloud({ projectId: "proj_123" })).rejects.toThrow(
      "mcp_tool_error:unknown_error"
    );
  });
});
