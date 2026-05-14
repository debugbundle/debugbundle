import { describe, expect, it, vi } from "vitest";

import { verifyCloudCommand } from "../../../apps/cli/src/verify-command.js";

describe("cli verify cloud configured client-error command", () => {
  it("actively verifies configured cloud 4xx request incidents through real ingestion", async () => {
    const createProjectToken = vi.fn().mockResolvedValue({
      token_id: "tok_verify_4xx",
      project_id: "proj_123",
      label: "debugbundle verify cloud 20260314001000",
      created_at: "2026-03-14T00:10:00.000Z",
      last_used_at: null,
      revoked_at: null,
      expires_at: null,
      plaintext: "dbundle_proj_verify_4xx"
    });
    const revokeProjectToken = vi.fn().mockResolvedValue({
      token_id: "tok_verify_4xx",
      project_id: "proj_123",
      label: "debugbundle verify cloud 20260314001000",
      created_at: "2026-03-14T00:10:00.000Z",
      last_used_at: null,
      revoked_at: "2026-03-14T00:10:01.000Z",
      expires_at: null
    });
    const sendEvents = vi.fn().mockResolvedValue({ accepted: 1, rejected: 0, errors: [] });
    const listIncidents = vi.fn().mockResolvedValue({
      incidents: [
        {
          incident_id: "inc_verify_4xx",
          last_seen_at: "2026-03-14T00:10:03.000Z",
          incident_reason: {
            kind: "request_failure",
            description: "request_event matched the immediate request failure incident rule",
            event_type: "request_event",
            event_class: "incident_signal",
            matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
          }
        }
      ],
      next_cursor: null
    });
    const getBundle = vi.fn().mockResolvedValue({ bundle_version: 1 });

    const result = await verifyCloudCommand(
      {
        projectId: "proj_123",
        service: "checkout-api",
        environment: "production",
        trigger4xxStatus: 403,
        json: true
      },
      {
        now: () => new Date("2026-03-14T00:10:00.000Z"),
        readAuthState: vi.fn().mockResolvedValue({
          bearer_token: "dbundle_mem_secret_token",
          base_url: "https://api.debugbundle.com"
        }),
        createProjectToken,
        revokeProjectToken,
        sendEvents,
        listIncidents,
        getBundle,
        sleep: vi.fn().mockResolvedValue(undefined),
        pollAttempts: 1
      }
    );

    expect(result.exitCode).toBe(0);
    expect(sendEvents).toHaveBeenCalledWith({
      baseUrl: "https://api.debugbundle.com",
      projectToken: "dbundle_proj_verify_4xx",
      events: [
        expect.objectContaining({
          event_type: "request_event",
          sdk_name: "debugbundle-cli",
          service: expect.objectContaining({
            name: "checkout-api",
            environment: "production"
          }),
          payload: expect.objectContaining({
            method: "GET",
            path: "/debugbundle/verify/cloud/client-error/403",
            route_template: "/debugbundle/verify/cloud/client-error/403",
            response_status: 403,
            response_headers: expect.objectContaining({
              "x-debugbundle-verification": "client-error-403"
            })
          })
        })
      ]
    });
    expect(JSON.parse(result.output)).toEqual({
      status: "healthy",
      checks: [
        {
          name: "auth-state",
          status: "ok",
          message: "Found valid auth state."
        },
        {
          name: "active-4xx-event",
          status: "ok",
          message: "Sent synthetic 403 request_event through cloud ingestion."
        },
        {
          name: "incident-retrieval",
          status: "ok",
          message: "Retrieved cloud incident inc_verify_4xx for the synthetic 403 request."
        },
        {
          name: "bundle-status",
          status: "ok",
          message: "Bundle for incident inc_verify_4xx is ready."
        },
        {
          name: "verification-token-cleanup",
          status: "ok",
          message: "Revoked temporary verification project token."
        }
      ],
      warnings: [],
      errors: [],
      suggested_actions: [
        "Run debugbundle inspect inc_verify_4xx --source cloud to inspect why the incident fired.",
        "Run debugbundle bundle inc_verify_4xx --source cloud to fetch the generated debug bundle."
      ],
      auto_fix_available: false,
      verification: {
        mode: "active_4xx",
        accepted_event_count: 1,
        incident_id: "inc_verify_4xx",
        bundle_status: "ready",
        classification_reason: {
          kind: "request_failure",
          description: "request_event matched the immediate request failure incident rule",
          event_type: "request_event",
          event_class: "incident_signal",
          matched_policy: "Immediate request failure statuses bypass capture_request_events suppression"
        },
        suggested_next_command: "debugbundle inspect inc_verify_4xx --source cloud"
      }
    });
  });

  it("rejects invalid or conflicting active cloud trigger inputs", async () => {
    const conflicting = await verifyCloudCommand({
      projectId: "proj_123",
      trigger5xx: true,
      trigger4xxStatus: 403,
      json: true
    });

    const invalidStatus = await verifyCloudCommand({
      projectId: "proj_123",
      trigger4xxStatus: 399,
      json: true
    });

    expect(conflicting.exitCode).toBe(4);
    expect(JSON.parse(conflicting.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "trigger-input",
          status: "error",
          message: "Choose either --trigger-5xx or --trigger-4xx, not both."
        }
      ],
      warnings: [],
      errors: ["Choose either --trigger-5xx or --trigger-4xx, not both."],
      suggested_actions: [
        "Run debugbundle login to choose an auth flow, or use debugbundle login --github, debugbundle login --github-device, or debugbundle login <dbundle_mem_...> to create ~/.debugbundle/auth.json before verifying cloud traffic.",
        "Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."
      ],
      auto_fix_available: false
    });

    expect(invalidStatus.exitCode).toBe(4);
    expect(JSON.parse(invalidStatus.output)).toEqual({
      status: "error",
      checks: [
        {
          name: "trigger-input",
          status: "error",
          message: "--trigger-4xx must be an integer status between 400 and 499."
        }
      ],
      warnings: [],
      errors: ["--trigger-4xx must be an integer status between 400 and 499."],
      suggested_actions: [
        "Run debugbundle login to choose an auth flow, or use debugbundle login --github, debugbundle login --github-device, or debugbundle login <dbundle_mem_...> to create ~/.debugbundle/auth.json before verifying cloud traffic.",
        "Generate a live cloud request, then re-run debugbundle verify cloud with the correct project and service filters."
      ],
      auto_fix_available: false
    });
  });
});