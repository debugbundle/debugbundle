import { describe, expect, it, vi } from "vitest";
import {
  GitHubDispatchDeliveryError,
  processNextDeliverGitHubDispatchJob
} from "../../../apps/worker/src/processor.js";

describe("worker github dispatch delivery", () => {
  it("should mark github dispatch as delivered when transport succeeds", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "gdd_123", attempt: 1 })
    };

    const githubStore = {
      getGitHubDispatchDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "gdd_123",
        rule_id: "ghr_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        status: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_attempt_at: null,
        last_error: null,
        github_status_code: null,
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          debugbundle: {
            project_id: "proj_123"
          }
        }
      }),
      markGitHubDispatchDeliveryAttempt: vi
        .fn()
        .mockResolvedValue({ status: "delivered", next_attempt: null })
    };

    const githubDispatchTransport = {
      deliver: vi.fn().mockResolvedValue(undefined)
    };

    const result = await processNextDeliverGitHubDispatchJob({
      queue,
      githubStore,
      githubDispatchTransport
    });

    expect(result).toEqual({ processed: true });
    expect(githubStore.markGitHubDispatchDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "gdd_123",
      attempt: 1,
      delivered: true,
      error_message: null,
      github_status_code: 204
    });
  });

  it("should propagate github response codes from dispatch failures", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "gdd_123", attempt: 1 })
    };

    const githubStore = {
      getGitHubDispatchDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "gdd_123",
        rule_id: "ghr_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        status: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_attempt_at: null,
        last_error: null,
        github_status_code: null,
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          debugbundle: {
            project_id: "proj_123"
          }
        }
      }),
      markGitHubDispatchDeliveryAttempt: vi
        .fn()
        .mockResolvedValue({ status: "retrying", next_attempt: 2 })
    };

    const githubDispatchTransport = {
      deliver: vi
        .fn()
        .mockRejectedValue(new GitHubDispatchDeliveryError("github_dispatch_http_error_503", 503))
    };

    const result = await processNextDeliverGitHubDispatchJob({
      queue,
      githubStore,
      githubDispatchTransport
    });

    expect(result).toEqual({ processed: true });
    expect(githubStore.markGitHubDispatchDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "gdd_123",
      attempt: 1,
      delivered: false,
      error_message: "github_dispatch_http_error_503",
      github_status_code: 503
    });
  });

  it("should propagate github Retry-After values from dispatch failures", async (): Promise<void> => {
    const queue = {
      enqueue: vi.fn(),
      dequeue: vi.fn().mockResolvedValue({ delivery_id: "gdd_123", attempt: 1 })
    };

    const githubStore = {
      getGitHubDispatchDeliveryIntent: vi.fn().mockResolvedValue({
        delivery_id: "gdd_123",
        rule_id: "ghr_123",
        project_id: "proj_123",
        incident_id: "inc_123",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        status: "pending",
        attempt_count: 0,
        next_attempt_at: null,
        last_attempt_at: null,
        last_error: null,
        github_status_code: null,
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          debugbundle: {
            project_id: "proj_123"
          }
        }
      }),
      markGitHubDispatchDeliveryAttempt: vi
        .fn()
        .mockResolvedValue({ status: "retrying", next_attempt: 2 })
    };

    const githubDispatchTransport = {
      deliver: vi
        .fn()
        .mockRejectedValue(
          new GitHubDispatchDeliveryError("github_dispatch_http_error_429", 429, 17)
        )
    };

    const result = await processNextDeliverGitHubDispatchJob({
      queue,
      githubStore,
      githubDispatchTransport
    });

    expect(result).toEqual({ processed: true });
    expect(githubStore.markGitHubDispatchDeliveryAttempt).toHaveBeenCalledWith({
      delivery_id: "gdd_123",
      attempt: 1,
      delivered: false,
      error_message: "github_dispatch_http_error_429",
      github_status_code: 429,
      retry_after_seconds: 17
    });
  });
});
