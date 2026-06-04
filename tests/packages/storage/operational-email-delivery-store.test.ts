import { describe, expect, it, vi } from "vitest";

import { createPostgresOperationalEmailDeliveryStore } from "../../../packages/storage/src/operational-email-delivery-store.js";

describe("operational email delivery store", () => {
  it("queues organization-scoped trial emails without a project", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ delivery_id: "op_trial_123", created: true }]
    });

    const store = createPostgresOperationalEmailDeliveryStore({ query });
    const result = await store.queueOrganizationOperationalEmailDelivery({
      organization_id: "org_123",
      kind: "trial_started",
      dedupe_key: "trial_started:2026-06-01T00:00:00.000Z",
      payload: {
        trial_plan: "team",
        trial_ends_at: "2026-07-01T00:00:00.000Z"
      }
    });

    expect(result).toEqual({ delivery_id: "op_trial_123", created: true });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO operational_email_deliveries"),
      expect.arrayContaining([
        expect.any(String),
        "org_123",
        null,
        "trial_started",
        "trial_started:2026-06-01T00:00:00.000Z",
        JSON.stringify({
          trial_plan: "team",
          trial_ends_at: "2026-07-01T00:00:00.000Z"
        })
      ])
    );
  });

  it("resolves organization recipient context when no project is attached", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          organization_name: "Acme Corp",
          project_name: null,
          recipient_email: "owner@example.com"
        }
      ]
    });

    const store = createPostgresOperationalEmailDeliveryStore({ query });
    const result = await store.resolveOperationalEmailRecipientContext({
      organization_id: "org_123",
      project_id: null
    });

    expect(result).toEqual({
      organization_name: "Acme Corp",
      project_name: null,
      recipient_email: "owner@example.com"
    });
  });
});
