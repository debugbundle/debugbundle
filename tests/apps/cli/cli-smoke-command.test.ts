import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { smokeCommand } from "../../../apps/cli/src/smoke-command.js";

const smokeGolden = await readFile(new URL("../../fixtures/cli-smoke.golden.txt", import.meta.url), "utf8");

describe("cli smoke command", () => {
  it("aggregates healthy local and cloud verification in human mode", async () => {
    const result = await smokeCommand(
      {
        projectId: "proj_123",
        service: "checkout-api"
      },
      {
        verifyLocal: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: JSON.stringify({
            status: "healthy",
            checks: [],
            warnings: [],
            errors: [],
            suggested_actions: ["local ok"],
            auto_fix_available: false
          })
        }),
        verifyCloud: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: JSON.stringify({
            status: "healthy",
            checks: [],
            warnings: [],
            errors: [],
            suggested_actions: ["prod ok"],
            auto_fix_available: false
          })
        })
      }
    );

    expect(result).toEqual({
      exitCode: 0,
      output: smokeGolden
    });
  });

  it("returns validation failures when local verification fails validation", async () => {
    const result = await smokeCommand(
      {
        projectId: "proj_123",
        json: true
      },
      {
        verifyLocal: vi.fn().mockResolvedValue({
          exitCode: 4,
          output: JSON.stringify({
            status: "error",
            checks: [],
            warnings: [],
            errors: ["Missing .debugbundle/profile.json"],
            suggested_actions: ["run init"],
            auto_fix_available: false
          })
        }),
        verifyCloud: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: JSON.stringify({
            status: "healthy",
            checks: [],
            warnings: [],
            errors: [],
            suggested_actions: ["prod ok"],
            auto_fix_available: false
          })
        })
      }
    );

    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "local-verification",
          status: "error",
          message: "Local verification failed."
        },
        {
          name: "cloud-verification",
          status: "ok",
          message: "Cloud verification passed."
        }
      ],
      warnings: [],
      errors: ["local: Missing .debugbundle/profile.json"],
      suggested_actions: [
        "Run debugbundle verify local to inspect local setup failures in detail.",
        "Run debugbundle verify cloud to inspect hosted traffic verification in detail."
      ],
      auto_fix_available: false
    });
  });

  it("returns auth/config failures when cloud verification cannot authenticate", async () => {
    const result = await smokeCommand(
      {
        projectId: "proj_123",
        json: true
      },
      {
        verifyLocal: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: JSON.stringify({
            status: "healthy",
            checks: [],
            warnings: [],
            errors: [],
            suggested_actions: ["local ok"],
            auto_fix_available: false
          })
        }),
        verifyCloud: vi.fn().mockResolvedValue({
          exitCode: 2,
          output: JSON.stringify({
            status: "error",
            checks: [],
            warnings: [],
            errors: ["Not logged in."],
            suggested_actions: ["run login"],
            auto_fix_available: false
          })
        })
      }
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "local-verification",
          status: "ok",
          message: "Local verification passed."
        },
        {
          name: "cloud-verification",
          status: "error",
          message: "Cloud verification failed."
        }
      ],
      warnings: [],
      errors: ["cloud: Not logged in."],
      suggested_actions: [
        "Run debugbundle verify local to inspect local setup failures in detail.",
        "Run debugbundle verify cloud to inspect hosted traffic verification in detail."
      ],
      auto_fix_available: false
    });
  });

  it("aggregates warning states and forwards optional cloud inputs", async () => {
    const verifyLocal = vi.fn().mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({
        status: "warning",
        warnings: ["local warning"],
        errors: []
      })
    });
    const verifyCloud = vi.fn().mockResolvedValue({
      exitCode: 3,
      output: JSON.stringify({
        status: "warning",
        warnings: ["prod warning"],
        errors: []
      })
    });

    const result = await smokeCommand(
      {
        projectId: "proj_123",
        service: "checkout-api",
        environment: "production",
        maxAgeMinutes: 30,
        authFilePath: "/tmp/auth.json",
        json: true
      },
      {
        verifyLocal,
        verifyCloud
      }
    );

    expect(verifyLocal).toHaveBeenCalledWith({
      json: true
    });
    expect(verifyCloud).toHaveBeenCalledWith({
      projectId: "proj_123",
      service: "checkout-api",
      environment: "production",
      maxAgeMinutes: 30,
      authFilePath: "/tmp/auth.json",
      json: true
    });
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.output)).toEqual({
      status: "warning",
      checks: [
        {
          name: "local-verification",
          status: "warning",
          message: "Local verification completed with warnings."
        },
        {
          name: "cloud-verification",
          status: "warning",
          message: "Cloud verification completed with warnings."
        }
      ],
      warnings: ["local: local warning", "cloud: prod warning"],
      errors: [],
      suggested_actions: [
        "Run debugbundle verify local to inspect local setup failures in detail.",
        "Run debugbundle verify cloud to inspect hosted traffic verification in detail."
      ],
      auto_fix_available: false
    });
  });

  it("fails smoke orchestration when child verification output is invalid", async () => {
    const result = await smokeCommand(
      {
        projectId: "proj_123",
        json: true
      },
      {
        verifyLocal: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: "not-json"
        }),
        verifyCloud: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: JSON.stringify({
            status: "healthy",
            warnings: [],
            errors: []
          })
        })
      }
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "local-verification",
          status: "error",
          message: "Smoke orchestration failed."
        },
        {
          name: "cloud-verification",
          status: "error",
          message: "Smoke orchestration failed."
        }
      ],
      warnings: [],
      errors: ["Unexpected token 'o', \"not-json\" is not valid JSON"],
      suggested_actions: [
        "Run debugbundle verify local to inspect local setup failures in detail.",
        "Run debugbundle verify cloud to inspect hosted traffic verification in detail."
      ],
      auto_fix_available: false
    });
  });
});