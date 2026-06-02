import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApiServer } from "../../../apps/api/src/server.js";
import type { GitHubMarketplaceWebhookDependencies } from "../../../apps/api/src/routes/github-marketplace-webhook.js";
import type { GitHubMarketplaceStore } from "../../../packages/storage/src/index.js";

type ApiServerDependencies = Parameters<typeof createApiServer>[0];
type GitHubMarketplaceStoreWithMocks = GitHubMarketplaceStore & {
  isEventProcessed: ReturnType<typeof vi.fn>;
  markEventProcessed: ReturnType<typeof vi.fn>;
  upsertMarketplaceAccount: ReturnType<typeof vi.fn>;
  linkOrganizationToMarketplaceAccountByInstallationId: ReturnType<typeof vi.fn>;
};

function createMockMarketplaceStore(): GitHubMarketplaceStoreWithMocks {
  return {
    isEventProcessed: vi.fn().mockResolvedValue(false),
    markEventProcessed: vi.fn().mockResolvedValue(undefined),
    upsertMarketplaceAccount: vi.fn().mockResolvedValue({
      id: "gma_1",
      organization_id: null,
      marketplace_account_id: 42,
      marketplace_account_login: "debugbundle",
      marketplace_account_type: "Organization",
      marketplace_account_node_id: null,
      marketplace_listing_plan_id: 7,
      marketplace_listing_plan_name: "Free",
      marketplace_plan_price_model: "FREE",
      billing_cycle: null,
      unit_count: null,
      on_free_trial: false,
      free_trial_ends_on: null,
      next_billing_date: null,
      effective_date: "2026-06-02T12:00:00.000Z",
      installation_id: 99,
      marketplace_purchase_status: "purchased",
      last_event_id: "delivery_123",
      last_event_action: "purchased",
      created_at: "2026-06-02T12:00:00.000Z",
      updated_at: "2026-06-02T12:00:00.000Z"
    }),
    linkOrganizationToMarketplaceAccountByInstallationId: vi.fn().mockResolvedValue(null)
  };
}

function createMinimalServer(
  overrides: Partial<GitHubMarketplaceWebhookDependencies> = {}
): {
  app: FastifyInstance;
  githubMarketplaceStore: GitHubMarketplaceStoreWithMocks;
} {
  const githubMarketplaceStore =
    overrides.githubMarketplaceStore === undefined
      ? createMockMarketplaceStore()
      : (overrides.githubMarketplaceStore as GitHubMarketplaceStoreWithMocks);

  const app = createApiServer(
    {
      ingestionPersistence: { persistAndEnqueue: vi.fn() },
      ingestionMetadata: { resolveProjectByTokenHash: vi.fn() },
      memberAuth: { resolveMemberByTokenHash: vi.fn().mockResolvedValue(null) },
      webAuth: {
        requestEmailCode: vi.fn(),
        verifyEmailCode: vi.fn(),
        beginGithubAuth: vi.fn(),
        completeGithubAuth: vi.fn(),
        acceptInviteForSession: vi.fn(),
        revokeSessionByToken: vi.fn(),
        resolveSessionByToken: vi.fn().mockResolvedValue(null)
      },
      tokenManagement: {
        listProjectTokensForOrganization: vi.fn().mockResolvedValue([]),
        createProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
        revokeProjectTokenForOrganization: vi.fn().mockResolvedValue(null),
        listMemberTokensForOrganization: vi.fn().mockResolvedValue([]),
        createMemberTokenForOrganization: vi.fn().mockResolvedValue(null),
        revokeMemberTokenForOrganization: vi.fn().mockResolvedValue(null)
      },
      incidentRetrieval: {
        listIncidentsForOrganization: vi.fn().mockResolvedValue([]),
        getIncidentForOrganization: vi.fn().mockResolvedValue(null),
        listIncidentLogsForOrganization: vi.fn().mockResolvedValue([]),
        listServicesForOrganization: vi.fn().mockResolvedValue([])
      },
      objectStoreReader: { getObject: vi.fn() },
      webhookDelivery: {
        listDeliveriesForWebhookInOrganization: vi.fn().mockResolvedValue({ deliveries: [] }),
        retryDeliveryForOrganization: vi.fn().mockResolvedValue(null)
      }
    } as ApiServerDependencies,
    {
      githubMarketplaceWebhook: {
        webhookSecret: "marketplace_secret",
        githubMarketplaceStore,
        ...overrides
      }
    }
  );

  return { app, githubMarketplaceStore };
}

function signBody(body: Buffer, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("github marketplace webhook route", () => {
  it("rejects requests without a signature", async () => {
    const { app } = createMinimalServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/github/marketplace/webhook",
      payload: Buffer.from("{}"),
      headers: { "content-type": "application/json", "x-github-event": "ping", "x-github-delivery": "delivery_123" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "missing_github_signature" });
  });

  it("rejects requests with invalid signatures", async () => {
    const { app } = createMinimalServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/github/marketplace/webhook",
      payload: Buffer.from("{}"),
      headers: {
        "content-type": "application/json",
        "x-github-event": "ping",
        "x-github-delivery": "delivery_123",
        "x-hub-signature-256": "sha256=bad"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_signature" });
  });

  it("accepts and records ping deliveries", async () => {
    const { app, githubMarketplaceStore } = createMinimalServer();
    const payload = Buffer.from("{}");

    const response = await app.inject({
      method: "POST",
      url: "/v1/github/marketplace/webhook",
      payload,
      headers: {
        "content-type": "application/json",
        "x-github-event": "ping",
        "x-github-delivery": "delivery_123",
        "x-hub-signature-256": signBody(payload, "marketplace_secret")
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(githubMarketplaceStore.markEventProcessed).toHaveBeenCalledWith({
      delivery_id: "delivery_123",
      event_name: "ping",
      marketplace_account_id: null,
      action: null
    });
  });

  it("skips duplicate deliveries", async () => {
    const githubMarketplaceStore = createMockMarketplaceStore();
    githubMarketplaceStore.isEventProcessed.mockResolvedValue(true);
    const { app } = createMinimalServer({ githubMarketplaceStore });
    const payload = Buffer.from("{}");

    const response = await app.inject({
      method: "POST",
      url: "/v1/github/marketplace/webhook",
      payload,
      headers: {
        "content-type": "application/json",
        "x-github-event": "ping",
        "x-github-delivery": "delivery_123",
        "x-hub-signature-256": signBody(payload, "marketplace_secret")
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, duplicate: true });
    expect(githubMarketplaceStore.markEventProcessed).not.toHaveBeenCalled();
  });

  it("persists marketplace purchase snapshots without mutating install state", async () => {
    const { app, githubMarketplaceStore } = createMinimalServer();
    const payload = Buffer.from(
      JSON.stringify({
        action: "purchased",
        effective_date: "2026-06-02T12:00:00.000Z",
        installation: { id: 99 },
        marketplace_purchase: {
          account: {
            id: 42,
            login: "debugbundle",
            type: "Organization"
          },
          plan: {
            id: 7,
            name: "Free",
            price_model: "FREE"
          },
          on_free_trial: false
        }
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/github/marketplace/webhook",
      payload,
      headers: {
        "content-type": "application/json",
        "x-github-event": "marketplace_purchase",
        "x-github-delivery": "delivery_123",
        "x-hub-signature-256": signBody(payload, "marketplace_secret")
      }
    });

    expect(response.statusCode).toBe(200);
    expect(githubMarketplaceStore.upsertMarketplaceAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        marketplace_account_id: 42,
        marketplace_listing_plan_name: "Free",
        installation_id: 99,
        marketplace_purchase_status: "purchased",
        last_event_id: "delivery_123"
      })
    );
    expect(githubMarketplaceStore.markEventProcessed).toHaveBeenCalledWith({
      delivery_id: "delivery_123",
      event_name: "marketplace_purchase",
      marketplace_account_id: 42,
      action: "purchased"
    });
  });
});
