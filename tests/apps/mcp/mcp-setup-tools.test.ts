import { describe, expect, it, vi } from "vitest";

import { SETUP_MCP_TOOL_NAMES, createSetupMcpTools } from "../../../apps/mcp/src/setup-tools.js";

describe("mcp setup tools", () => {
  it("declares setup and verification tool parity", () => {
    expect(SETUP_MCP_TOOL_NAMES).toEqual([
      "doctor",
      "validate",
      "verify_local",
      "verify_cloud",
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
        checks: [{ name: "profile-schema", status: "error", message: "Profile validation failed with 1 errors." }],
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
      checks: [{ name: "profile-schema", status: "error", message: "Profile validation failed with 1 errors." }],
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
        checks: [{ name: "bundle-retrieval", status: "ok", message: "Retrieved bundle for incident inc_verify_123." }],
        warnings: [],
        errors: [],
        suggested_actions: ["Review incident inc_verify_123 if you want to inspect the verification bundle."],
        auto_fix_available: false
      })
    });
    const verifyCloudCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      output: JSON.stringify({
        status: "error",
        checks: [{ name: "passive-traffic-check", status: "error", message: "Latest production incident inc_prod_123 is older than the 15 minute verification window." }],
        warnings: [],
        errors: ["Latest production incident inc_prod_123 is older than the 15 minute verification window."],
        suggested_actions: ["Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."],
        auto_fix_available: false
      })
    });
    const smokeCommand = vi.fn().mockResolvedValue({
      exitCode: 2,
      output: JSON.stringify({
        status: "error",
        checks: [{ name: "cloud-verification", status: "error", message: "Cloud verification failed." }],
        warnings: [],
        errors: ["cloud: Not logged in."],
        suggested_actions: ["Run debugbundle verify cloud to inspect hosted traffic verification in detail."],
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
      checks: [{ name: "bundle-retrieval", status: "ok", message: "Retrieved bundle for incident inc_verify_123." }],
      warnings: [],
      errors: [],
      suggested_actions: ["Review incident inc_verify_123 if you want to inspect the verification bundle."],
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
      checks: [{ name: "passive-traffic-check", status: "error", message: "Latest production incident inc_prod_123 is older than the 15 minute verification window." }],
      warnings: [],
      errors: ["Latest production incident inc_prod_123 is older than the 15 minute verification window."],
      suggested_actions: ["Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."],
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
      checks: [{ name: "passive-traffic-check", status: "error", message: "Latest production incident inc_prod_123 is older than the 15 minute verification window." }],
      warnings: [],
      errors: ["Latest production incident inc_prod_123 is older than the 15 minute verification window."],
      suggested_actions: ["Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."],
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
      checks: [{ name: "cloud-verification", status: "error", message: "Cloud verification failed." }],
      warnings: [],
      errors: ["cloud: Not logged in."],
      suggested_actions: ["Run debugbundle verify cloud to inspect hosted traffic verification in detail."],
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
    await expect(tools.verify_cloud({ projectId: "proj_123" })).rejects.toThrow("mcp_tool_error:unknown_error");
  });
});
