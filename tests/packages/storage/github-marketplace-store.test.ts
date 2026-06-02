import { describe, expect, it, vi } from "vitest";

import { createPostgresGitHubMarketplaceStore } from "../../../packages/storage/src/github-marketplace-store.js";

function createMockDb(): {
  query: ReturnType<typeof vi.fn>;
  store: ReturnType<typeof createPostgresGitHubMarketplaceStore>;
} {
  const query = vi.fn();
  return { query, store: createPostgresGitHubMarketplaceStore({ query }) };
}

describe("createPostgresGitHubMarketplaceStore", () => {
  it("checks webhook delivery idempotency by delivery id", async () => {
    const { query, store } = createMockDb();
    query.mockResolvedValue({ rows: [{ exists: true }] });

    await expect(store.isEventProcessed("delivery_123")).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("processed_github_marketplace_events"),
      ["delivery_123"]
    );
  });

  it("records processed deliveries with account id and action", async () => {
    const { query, store } = createMockDb();
    query.mockResolvedValue({ rows: [] });

    await store.markEventProcessed({
      delivery_id: "delivery_123",
      event_name: "marketplace_purchase",
      marketplace_account_id: 42,
      action: "purchased"
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO processed_github_marketplace_events"),
      ["delivery_123", "marketplace_purchase", 42, "purchased"]
    );
  });

  it("upserts the latest marketplace account snapshot", async () => {
    const { query, store } = createMockDb();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "gma_1",
            organization_id: null,
            marketplace_account_id: 42,
            marketplace_account_login: "debugbundle",
            marketplace_account_type: "Organization",
            marketplace_account_node_id: "MDEyOk9yZw==",
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
          }
        ]
      });

    const record = await store.upsertMarketplaceAccount({
      organization_id: null,
      marketplace_account_id: 42,
      marketplace_account_login: "debugbundle",
      marketplace_account_type: "Organization",
      marketplace_account_node_id: "MDEyOk9yZw==",
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
      last_event_action: "purchased"
    });

    expect(record).toEqual(
      expect.objectContaining({
        marketplace_account_id: 42,
        marketplace_listing_plan_name: "Free",
        installation_id: 99,
        marketplace_purchase_status: "purchased"
      })
    );
    expect(query.mock.calls[1]?.[0]).toContain("INSERT INTO github_marketplace_accounts");
  });

  it("links a stored marketplace account to an organization by installation id", async () => {
    const { query, store } = createMockDb();
    query.mockResolvedValue({
      rows: [
        {
          id: "gma_1",
          organization_id: "org_123",
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
          updated_at: "2026-06-02T12:05:00.000Z"
        }
      ]
    });

    const record = await store.linkOrganizationToMarketplaceAccountByInstallationId({
      organization_id: "org_123",
      installation_id: 99
    });

    expect(record?.organization_id).toBe("org_123");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE github_marketplace_accounts"),
      ["org_123", 99]
    );
  });
});
