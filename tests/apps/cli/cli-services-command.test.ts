import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { RetrievalApiError } from "../../../packages/retrieval-client/src/index.js";
import { CliAuthStateError } from "../../../apps/cli/src/auth-state.js";
import { listServicesCommand, listServicesWithAuthCommand } from "../../../apps/cli/src/services-command.js";

const servicesGolden = readFileSync(new URL("../../fixtures/cli-services.golden.txt", import.meta.url), "utf8");

describe("cli services command", () => {
  it("renders service list in human mode", async () => {
    const result = await listServicesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123"
      },
      {
        listServices: vi.fn().mockResolvedValue([
          {
            service_id: "svc_123",
            project_id: "proj_123",
            name: "checkout-api",
            runtime: "node",
            framework: "fastify",
            environment: "production"
          }
        ])
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(servicesGolden);
  });

  it("returns JSON output in json mode", async () => {
    const result = await listServicesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123",
        json: true
      },
      {
        listServices: vi.fn().mockResolvedValue([
          {
            service_id: "svc_123",
            project_id: "proj_123",
            name: "checkout-api",
            runtime: "node",
            framework: "fastify",
            environment: "production"
          }
        ])
      }
    );

    expect(JSON.parse(result.output)).toEqual({
      services: [
        {
          service_id: "svc_123",
          project_id: "proj_123",
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        }
      ]
    });
  });

  it("maps retrieval api errors to deterministic exit codes", async () => {
    const result = await listServicesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_missing"
      },
      {
        listServices: vi.fn().mockRejectedValue(new RetrievalApiError(404, "project_not_found"))
      }
    );

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("project_not_found");
  });

  it("loads stored auth state and forwards it into services retrieval", async () => {
    const readAuthState = vi.fn().mockResolvedValue({
      bearer_token: "dbundle_mem_saved",
      base_url: "https://selfhost.debugbundle.test"
    });
    const httpClient = { request: vi.fn() };
    const createHttpClient = vi.fn().mockReturnValue(httpClient);
    const listServices = vi.fn().mockResolvedValue([
      {
        service_id: "svc_123",
        project_id: "proj_123",
        name: "checkout-api",
        runtime: "node",
        framework: "fastify",
        environment: "production"
      }
    ]);
    const createApi = vi.fn().mockReturnValue({
      listIncidents: vi.fn(),
      getIncident: vi.fn(),
      getBundle: vi.fn(),
      listLogs: vi.fn(),
      getReproduction: vi.fn(),
      listServices
    });

    const result = await listServicesWithAuthCommand(
      {
        authFilePath: "/tmp/auth.json",
        projectId: "proj_123",
        json: true
      },
      {
        readAuthState,
        createHttpClient,
        createApi
      }
    );

    expect(createHttpClient).toHaveBeenCalledWith({
      baseUrl: "https://selfhost.debugbundle.test"
    });
    expect(listServices).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_saved",
      projectId: "proj_123"
    });
    expect(JSON.parse(result.output)).toEqual({
      services: [
        {
          service_id: "svc_123",
          project_id: "proj_123",
          name: "checkout-api",
          runtime: "node",
          framework: "fastify",
          environment: "production"
        }
      ]
    });
  });

  it("handles empty, limited, and generic error service responses", async () => {
    const listServices = vi.fn().mockResolvedValue([]);

    const emptyResult = await listServicesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123",
        limit: 5
      },
      {
        listServices
      }
    );

    const genericFailure = await listServicesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123"
      },
      {
        listServices: vi.fn().mockRejectedValue("services_failed")
      }
    );

    expect(listServices).toHaveBeenCalledWith({
      bearerToken: "dbundle_mem_x",
      projectId: "proj_123",
      limit: 5
    });
    expect(emptyResult.output).toBe("No services found.");
    expect(genericFailure).toEqual({
      exitCode: 1,
      output: "services_failed"
    });
  });

  it("maps additional service command auth and validation failures", async () => {
    const unauthorized = await listServicesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123"
      },
      {
        listServices: vi.fn().mockRejectedValue(new RetrievalApiError(401, "invalid_member_token"))
      }
    );

    const badRequest = await listServicesCommand(
      {
        bearerToken: "dbundle_mem_x",
        projectId: "proj_123"
      },
      {
        listServices: vi.fn().mockRejectedValue(new RetrievalApiError(400, "invalid_limit"))
      }
    );

    const authFailure = await listServicesWithAuthCommand(
      {
        projectId: "proj_123"
      },
      {
        readAuthState: vi.fn().mockRejectedValue(new CliAuthStateError("auth_state_missing", "Not logged in."))
      }
    );

    expect(unauthorized.exitCode).toBe(2);
    expect(badRequest.exitCode).toBe(4);
    expect(authFailure).toEqual({
      exitCode: 2,
      output: "Not logged in."
    });
  });
});