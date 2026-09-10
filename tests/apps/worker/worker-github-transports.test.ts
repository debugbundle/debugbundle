import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  redisQuitMock,
  poolQueryMock,
  processNextNormalizeEventsJobMock,
  processNextGroupIncidentJobMock,
  processNextBuildBundleJobMock,
  processNextBuildReproductionJobMock,
  processNextEvaluateAlertsJobMock,
  processNextDeliverWebhookJobMock,
  processNextDeliverGitHubDispatchJobMock,
  TEST_GITHUB_PRIVATE_KEY,
  WORKER_TABLE_ROWS,
  resetWorkerRuntimeMocks
} from "../../helpers/worker-runtime-mocks.js";
import { generateKeyPairSync } from "node:crypto";
import {
  buildGitHubAppJwt,
  createGitHubDispatchTransport,
  encodeBase64Url,
  normalizeGitHubPrivateKey,
  runWorkerFromEnv
} from "../../../apps/worker/src/runtime.js";

describe("worker github transports", () => {
  beforeEach(resetWorkerRuntimeMocks);

  it("should initialize and close the github token cache when github app credentials are configured", async (): Promise<void> => {
    poolQueryMock.mockResolvedValueOnce({ rows: WORKER_TABLE_ROWS });
    processNextNormalizeEventsJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextGroupIncidentJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildBundleJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextBuildReproductionJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });
    processNextEvaluateAlertsJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverWebhookJobMock.mockResolvedValueOnce({ processed: false, reason: "no_jobs" });
    processNextDeliverGitHubDispatchJobMock.mockResolvedValueOnce({
      processed: false,
      reason: "no_jobs"
    });

    await runWorkerFromEnv({
      WORKER_RUN_ONCE: "1",
      ANALYTICS_HASH_SECRET: "test-analytics-secret",
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "test-private-key"
    });

    expect(redisQuitMock).toHaveBeenCalledTimes(2);
  });

  it("should normalize escaped github app private keys before requesting installation tokens", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ token: "ghs_test" })
    });
    const createAppJwt = vi.fn().mockReturnValue("jwt_escaped");

    const transport = createGitHubDispatchTransport({
      appId: "123",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
      tokenCache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined)
      },
      fetchImpl: fetchMock,
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      createAppJwt
    });

    await expect(
      transport.deliver({
        delivery_id: "gdd_escaped",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          bundle_type: "failure",
          bundle_version: 3,
          severity: "high",
          service: "checkout-api",
          environment: "production",
          title: "TypeError in checkout",
          links: {
            bundle: "/v1/incidents/inc_123/bundle",
            reproduction: "/v1/incidents/inc_123/reproduction",
            dashboard: "/incidents/inc_123"
          },
          debugbundle: {
            project_id: "proj_123",
            occurrence_count: 12,
            first_seen_at: "2026-03-10T23:00:00.000Z"
          }
        }
      })
    ).resolves.toBeUndefined();

    expect(createAppJwt).toHaveBeenCalledWith(
      "123",
      "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
      new Date("2026-03-11T00:00:00.000Z")
    );
  });

  it("should encode github app jwt payloads with base64url segments", (): void => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const now = new Date("2026-03-11T00:00:00.000Z");

    expect(encodeBase64Url("debugbundle")).toBe(
      Buffer.from("debugbundle", "utf8").toString("base64url")
    );
    expect(normalizeGitHubPrivateKey(privateKeyPem.replace(/\n/g, "\\n"))).toBe(privateKeyPem);

    const jwt = buildGitHubAppJwt("123", privateKeyPem, now);
    const [encodedHeader, encodedPayload, signature] = jwt.split(".");

    if (encodedHeader === undefined || encodedPayload === undefined || signature === undefined) {
      throw new Error("github_app_jwt_segments_missing");
    }
    expect(signature.length).toBeGreaterThan(0);
    expect(JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"))).toEqual({
      alg: "RS256",
      typ: "JWT"
    });
    expect(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))).toEqual({
      iat: Math.floor(now.getTime() / 1000) - 30,
      exp: Math.floor(now.getTime() / 1000) + 9 * 60,
      iss: "123"
    });
  });

  it("should reject github dispatch transport responses with missing installation tokens", async (): Promise<void> => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({})
    });

    const transport = createGitHubDispatchTransport({
      appId: "123",
      privateKey: privateKeyPem,
      tokenCache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined)
      },
      fetchImpl: fetchMock,
      now: () => new Date("2026-03-11T00:00:00.000Z")
    });

    await expect(
      transport.deliver({
        delivery_id: "gdd_missing_token",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          debugbundle: {
            project_id: "proj_123"
          }
        }
      })
    ).rejects.toMatchObject({
      message: "github_dispatch_token_invalid_response"
    });
  });

  it("should reuse cached installation tokens for github dispatch transport", async (): Promise<void> => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ token: "ghs_cached" })
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    const get = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("ghs_cached");
    const set = vi.fn().mockResolvedValue(undefined);

    const transport = createGitHubDispatchTransport({
      appId: "123",
      privateKey: TEST_GITHUB_PRIVATE_KEY,
      tokenCache: { get, set },
      fetchImpl: fetchMock,
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      createAppJwt: () => "jwt_123"
    });

    await transport.deliver({
      delivery_id: "gdd_1",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "bundle.created",
        incident_id: "inc_123",
        bundle_type: "failure",
        bundle_version: 3,
        severity: "high",
        service: "checkout-api",
        environment: "production",
        title: "TypeError in checkout",
        links: {
          bundle: "/v1/incidents/inc_123/bundle",
          reproduction: "/v1/incidents/inc_123/reproduction",
          dashboard: "/incidents/inc_123"
        },
        debugbundle: {
          project_id: "proj_123",
          occurrence_count: 12,
          first_seen_at: "2026-03-10T23:00:00.000Z"
        }
      }
    });

    await transport.deliver({
      delivery_id: "gdd_2",
      installation_id: 99,
      repo_owner: "debugbundle",
      repo_name: "app",
      dispatch_payload: {
        debugbundle_event: "bundle.reopened",
        incident_id: "inc_456",
        bundle_type: "failure",
        bundle_version: 4,
        severity: "critical",
        service: "checkout-api",
        environment: "production",
        title: "Checkout regressed",
        links: {
          bundle: "/v1/incidents/inc_456/bundle",
          reproduction: "/v1/incidents/inc_456/reproduction",
          dashboard: "/incidents/inc_456"
        },
        debugbundle: {
          project_id: "proj_123",
          occurrence_count: 25,
          first_seen_at: "2026-03-10T21:00:00.000Z"
        }
      }
    });

    expect(set).toHaveBeenCalledWith("github-installation-token:99", "ghs_cached", 3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.github.com/repos/debugbundle/app/dispatches",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer ghs_cached" }),
        body: expect.stringContaining('"dispatch_id":"gdd_2"')
      })
    );
    const dispatchedRequest = fetchMock.mock.calls[2]?.[1];
    expect(dispatchedRequest).toEqual(
      expect.objectContaining({
        body: expect.stringContaining('"debugbundle_event":"bundle.reopened"')
      })
    );
    const dispatchedBody = JSON.parse(String(dispatchedRequest?.body)) as {
      client_payload: Record<string, unknown>;
    };
    expect(Object.keys(dispatchedBody.client_payload)).toHaveLength(10);
    expect(dispatchedBody.client_payload).toMatchObject({
      debugbundle_event: "bundle.reopened",
      incident_id: "inc_456",
      debugbundle: {
        project_id: "proj_123",
        occurrence_count: 25,
        first_seen_at: "2026-03-10T21:00:00.000Z",
        dispatch_id: "gdd_2",
        dispatched_at: "2026-03-11T00:00:00.000Z"
      }
    });
  });

  it("should surface github Retry-After headers from dispatch transport failures", async (): Promise<void> => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ token: "ghs_retry" })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: vi
            .fn()
            .mockImplementation((name: string) =>
              name.toLowerCase() === "retry-after" ? "17" : null
            )
        }
      });

    const transport = createGitHubDispatchTransport({
      appId: "123",
      privateKey: TEST_GITHUB_PRIVATE_KEY,
      tokenCache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined)
      },
      fetchImpl: fetchMock,
      now: () => new Date("2026-03-11T00:00:00.000Z"),
      createAppJwt: () => "jwt_123"
    });

    await expect(
      transport.deliver({
        delivery_id: "gdd_retry",
        installation_id: 99,
        repo_owner: "debugbundle",
        repo_name: "app",
        dispatch_payload: {
          debugbundle_event: "bundle.created",
          incident_id: "inc_123",
          bundle_version: 3,
          debugbundle: {
            project_id: "proj_123"
          }
        }
      })
    ).rejects.toMatchObject({
      message: "github_dispatch_http_error_429",
      statusCode: 429,
      retryAfterSeconds: 17
    });
  });
});
