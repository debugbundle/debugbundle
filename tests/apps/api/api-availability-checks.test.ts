import { describe, expect, it, vi } from "vitest";

import { AvailabilityCheckValidationError } from "../../../packages/storage/src/index.js";
import { createApiServer } from "../../../apps/api/src/server.ts";
import { mockedObject, type MockedMethods } from "../../helpers/vitest.ts";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type AvailabilityCheckManagementDependency = MockedMethods<
  NonNullable<ApiServerDependencies["availabilityCheckManagement"]>
>;
type ProjectManagementDependency = MockedMethods<NonNullable<ApiServerDependencies["projectManagement"]>>;
type MemberAuthDependency = MockedMethods<ApiServerDependencies["memberAuth"]>;

const checkFixture = {
  check_id: "11111111-1111-4111-8111-111111111111",
  project_id: "00000000-0000-4000-8000-000000000001",
  name: "Primary app",
  url: "https://app.example.com/health",
  method: "GET" as const,
  expected_status_min: 200,
  expected_status_max: 399,
  timeout_ms: 5000,
  interval_seconds: 60,
  failure_threshold: 3,
  recovery_threshold: 2,
  environment: "production",
  service_name: "web",
  enabled: true,
  status: "passing" as const,
  paused_reason: null,
  organization_plan: "solo" as const,
  consecutive_failures: 0,
  consecutive_successes: 4,
  linked_incident_id: null,
  last_checked_at: "2026-06-15T10:00:00.000Z",
  next_check_at: "2026-06-15T10:01:00.000Z",
  last_result_status: "success" as const,
  last_result_http_status: 200,
  last_result_error_kind: null,
  last_result_error_message: null,
  last_result_duration_ms: 183,
  created_at: "2026-06-15T09:00:00.000Z",
  updated_at: "2026-06-15T10:00:00.000Z"
};

const resultFixture = {
  result_id: "22222222-2222-4222-8222-222222222222",
  check_id: checkFixture.check_id,
  project_id: checkFixture.project_id,
  started_at: "2026-06-15T10:00:00.000Z",
  completed_at: "2026-06-15T10:00:00.183Z",
  duration_ms: 183,
  status: "success" as const,
  http_status: 200,
  error_kind: null,
  error_message: null,
  redirect_count: 0,
  checked_url_host: "app.example.com",
  final_url: "https://app.example.com/health"
};

const rollupFixture = {
  check_id: checkFixture.check_id,
  project_id: checkFixture.project_id,
  day: "2026-06-15",
  state: "operational" as const,
  total_checks: 1440,
  successful_checks: 1439,
  failed_checks: 1,
  degraded_checks: 0,
  avg_duration_ms: 190,
  first_checked_at: "2026-06-15T00:00:00.000Z",
  last_checked_at: "2026-06-15T23:59:30.000Z",
  downtime_seconds: 30,
  incident_ids: []
};

function createServer(overrides: {
  availabilityCheckManagement?: AvailabilityCheckManagementDependency;
  availabilityChecksUnavailable?: boolean;
  projectManagement?: Partial<ProjectManagementDependency>;
  memberAuth?: MemberAuthDependency;
} = {}): ReturnType<typeof createApiServer> {
  return createApiServer({
    ingestionPersistence: {
      persistAndEnqueue: vi.fn()
    },
    ingestionMetadata: mockedObject<ApiServerDependencies["ingestionMetadata"]>({
      resolveProjectByTokenHash: vi.fn().mockResolvedValue({ project_id: "proj_123", organization_plan: "free" })
    }),
    memberAuth:
      overrides.memberAuth ??
      mockedObject<ApiServerDependencies["memberAuth"]>({
        resolveMemberByTokenHash: vi.fn().mockResolvedValue({ member_id: "usr_123", organization_id: "org_owner" })
      }),
    tokenManagement: mockedObject<ApiServerDependencies["tokenManagement"]>({
      listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
      createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
      listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
      createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
      revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
    }),
    projectManagement: {
      resolveProjectAccessForUser:
        overrides.projectManagement?.resolveProjectAccessForUser ??
        vi.fn().mockResolvedValue({
          project_id: checkFixture.project_id,
          organization_id: "org_owner",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "owner",
          sharing_state: "owned",
          effective_role: "owner",
          organization_plan: "solo"
        }),
      listProjectsForOrganization: vi.fn().mockResolvedValue([]),
      createProjectForOrganization: vi.fn().mockResolvedValue(null),
      updateProjectForOrganization: vi.fn().mockResolvedValue(null),
      deleteProjectForOrganization: vi.fn().mockResolvedValue(null)
    },
    ...(overrides.availabilityChecksUnavailable === true
      ? {}
      : {
          availabilityCheckManagement:
            overrides.availabilityCheckManagement ??
            mockedObject<NonNullable<ApiServerDependencies["availabilityCheckManagement"]>>({
              listChecksForProjectInOrganization: vi.fn().mockResolvedValue([checkFixture]),
              getCheckForProjectInOrganization: vi.fn().mockResolvedValue(checkFixture),
              createCheckForProjectInOrganization: vi.fn().mockResolvedValue(checkFixture),
              updateCheckForProjectInOrganization: vi.fn().mockResolvedValue({
                ...checkFixture,
                interval_seconds: 120
              }),
              deleteCheckForProjectInOrganization: vi.fn().mockResolvedValue(true),
              listResultsForCheckInOrganization: vi.fn().mockResolvedValue([resultFixture]),
              listDailyRollupsForCheckInOrganization: vi.fn().mockResolvedValue([rollupFixture]),
              testCheck: vi.fn().mockResolvedValue({
                normalized_url: "https://app.example.com/health",
                result: {
                  status: "success",
                  http_status: 200,
                  duration_ms: 181,
                  error_kind: null,
                  error_message: null,
                  checked_url_host: "app.example.com",
                  checked_url_path: "/health",
                  checked_url_query: {},
                  final_url: "https://app.example.com/health",
                  redirect_count: 0
                }
              })
            })
        }),
    incidentRetrieval: {
      listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
      getIncidentForOrganization: vi.fn().mockResolvedValue(null),
      listIncidentLogsForOrganization: vi.fn().mockResolvedValue([])
    },
    objectStoreReader: {
      getObject: vi.fn()
    },
    webhookDelivery: {
      listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] })
    }
  });
}

describe("api availability check routes", () => {
  it("lists, fetches, mutates, tests, and reads retained history for owner access", async () => {
    const availabilityCheckManagement = mockedObject<
      NonNullable<ApiServerDependencies["availabilityCheckManagement"]>
    >({
      listChecksForProjectInOrganization: vi.fn().mockResolvedValue([checkFixture]),
      getCheckForProjectInOrganization: vi.fn().mockResolvedValue(checkFixture),
      createCheckForProjectInOrganization: vi.fn().mockResolvedValue(checkFixture),
      updateCheckForProjectInOrganization: vi.fn().mockResolvedValue({
        ...checkFixture,
        interval_seconds: 120
      }),
      deleteCheckForProjectInOrganization: vi.fn().mockResolvedValue(true),
      listResultsForCheckInOrganization: vi.fn().mockResolvedValue([resultFixture]),
      listDailyRollupsForCheckInOrganization: vi.fn().mockResolvedValue([rollupFixture]),
      testCheck: vi.fn().mockResolvedValue({
        normalized_url: "https://app.example.com/health",
        result: {
          status: "success",
          http_status: 200,
          duration_ms: 181,
          error_kind: null,
          error_message: null,
          checked_url_host: "app.example.com",
          checked_url_path: "/health",
          checked_url_query: {},
          final_url: "https://app.example.com/health",
          redirect_count: 0
        }
      })
    });
    const app = createServer({ availabilityCheckManagement });

    const authHeader = { authorization: "Bearer dbundle_mem_test" };

    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks`,
      headers: authHeader
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      checks: [expect.objectContaining({ check_id: checkFixture.check_id })],
      limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
    });

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/${checkFixture.check_id}`,
      headers: authHeader
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      check: expect.objectContaining({ check_id: checkFixture.check_id })
    });

    const createResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks`,
      headers: authHeader,
      payload: {
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 3,
        recovery_threshold: 2,
        environment: "production",
        service_name: "web",
        enabled: true
      }
    });
    expect(createResponse.statusCode).toBe(201);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/${checkFixture.check_id}`,
      headers: authHeader,
      payload: {
        interval_seconds: 120,
        enabled: false
      }
    });
    expect(updateResponse.statusCode).toBe(200);

    const resultsResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/${checkFixture.check_id}/results`,
      headers: authHeader
    });
    expect(resultsResponse.statusCode).toBe(200);
    expect(resultsResponse.json()).toEqual({ results: [resultFixture] });

    const rollupsResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/${checkFixture.check_id}/daily-rollups`,
      headers: authHeader
    });
    expect(rollupsResponse.statusCode).toBe(200);
    expect(rollupsResponse.json()).toEqual({ rollups: [rollupFixture] });

    const testResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/test`,
      headers: authHeader,
      payload: {
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000
      }
    });
    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({
      normalized_url: "https://app.example.com/health",
      result: { status: "success", http_status: 200 }
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/${checkFixture.check_id}`,
      headers: authHeader
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ deleted: true });

    expect(availabilityCheckManagement.createCheckForProjectInOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org_owner",
        project_id: checkFixture.project_id,
        created_by_user_id: "usr_123"
      })
    );
    expect(availabilityCheckManagement.updateCheckForProjectInOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        check_id: checkFixture.check_id,
        interval_seconds: 120,
        enabled: false
      })
    );
  });

  it("allows members to read checks but forbids mutations and tests", async () => {
    const app = createServer({
      projectManagement: {
        resolveProjectAccessForUser: vi.fn().mockResolvedValue({
          project_id: checkFixture.project_id,
          organization_id: "org_owner",
          owner_user_id: "usr_owner",
          owner_email: "owner@example.com",
          relationship: "shared",
          sharing_state: "shared_with_you",
          effective_role: "member",
          organization_plan: "solo"
        })
      }
    });

    const authHeader = { authorization: "Bearer dbundle_mem_test" };
    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks`,
      headers: authHeader
    });
    expect(listResponse.statusCode).toBe(200);

    const createResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks`,
      headers: authHeader,
      payload: {
        name: "Nope",
        url: "https://app.example.com/health",
        interval_seconds: 60
      }
    });
    expect(createResponse.statusCode).toBe(403);
    expect(createResponse.json()).toEqual({ error: "forbidden" });

    const testResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/test`,
      headers: authHeader,
      payload: {
        url: "https://app.example.com/health"
      }
    });
    expect(testResponse.statusCode).toBe(403);
    expect(testResponse.json()).toEqual({ error: "forbidden" });
  });

  it("maps plan-limit, interval-limit, and validation failures", async () => {
    const availabilityCheckManagement = mockedObject<
      NonNullable<ApiServerDependencies["availabilityCheckManagement"]>
    >({
      listChecksForProjectInOrganization: vi.fn().mockResolvedValue([]),
      getCheckForProjectInOrganization: vi.fn().mockResolvedValue(checkFixture),
      createCheckForProjectInOrganization: vi.fn().mockResolvedValue("limit_reached"),
      updateCheckForProjectInOrganization: vi.fn().mockResolvedValue("interval_too_low"),
      deleteCheckForProjectInOrganization: vi.fn().mockResolvedValue(true),
      listResultsForCheckInOrganization: vi.fn().mockResolvedValue([]),
      listDailyRollupsForCheckInOrganization: vi.fn().mockResolvedValue([]),
      testCheck: vi.fn().mockRejectedValue(
        new AvailabilityCheckValidationError("blocked_hostname", "Availability checks cannot target localhost or private hostnames.")
      )
    });
    const app = createServer({ availabilityCheckManagement });

    const authHeader = { authorization: "Bearer dbundle_mem_test" };

    const createResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks`,
      headers: authHeader,
      payload: {
        name: "Primary app",
        url: "https://app.example.com/health",
        method: "GET",
        expected_status_min: 200,
        expected_status_max: 399,
        timeout_ms: 5000,
        interval_seconds: 60,
        failure_threshold: 3,
        recovery_threshold: 2,
        enabled: true
      }
    });
    expect(createResponse.statusCode).toBe(409);
    expect(createResponse.json()).toEqual({
      error: "availability_check_limit_reached",
      limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
    });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/${checkFixture.check_id}`,
      headers: authHeader,
      payload: {
        interval_seconds: 30
      }
    });
    expect(updateResponse.statusCode).toBe(409);
    expect(updateResponse.json()).toEqual({
      error: "availability_check_interval_too_low",
      limits: { max_checks_per_project: 5, min_interval_seconds: 60 }
    });

    const testResponse = await app.inject({
      method: "POST",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/test`,
      headers: authHeader,
      payload: {
        url: "http://localhost/health"
      }
    });
    expect(testResponse.statusCode).toBe(400);
    expect(testResponse.json()).toEqual({
      error: "invalid_check_target",
      message: "Availability checks cannot target localhost or private hostnames."
    });
  });

  it("returns 404 when the feature or resource is unavailable", async () => {
    const unavailableApp = createServer({
      availabilityChecksUnavailable: true
    });
    const authHeader = { authorization: "Bearer dbundle_mem_test" };

    const unavailableResponse = await unavailableApp.inject({
      method: "GET",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks`,
      headers: authHeader
    });
    expect(unavailableResponse.statusCode).toBe(404);
    expect(unavailableResponse.json()).toEqual({ error: "availability_checks_unavailable" });

    const missingApp = createServer({
      availabilityCheckManagement: mockedObject<NonNullable<ApiServerDependencies["availabilityCheckManagement"]>>({
        listChecksForProjectInOrganization: vi.fn().mockResolvedValue(null),
        getCheckForProjectInOrganization: vi.fn().mockResolvedValue(null),
        createCheckForProjectInOrganization: vi.fn().mockResolvedValue("project_not_found"),
        updateCheckForProjectInOrganization: vi.fn().mockResolvedValue("check_not_found"),
        deleteCheckForProjectInOrganization: vi.fn().mockResolvedValue(false),
        listResultsForCheckInOrganization: vi.fn().mockResolvedValue(null),
        listDailyRollupsForCheckInOrganization: vi.fn().mockResolvedValue(null),
        testCheck: vi.fn()
      })
    });

    const getResponse = await missingApp.inject({
      method: "GET",
      url: `/v1/projects/${checkFixture.project_id}/availability-checks/${checkFixture.check_id}`,
      headers: authHeader
    });
    expect(getResponse.statusCode).toBe(404);
    expect(getResponse.json()).toEqual({ error: "check_not_found" });
  });
});
