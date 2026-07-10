import { describe, expect, it, vi } from "vitest";

import {
  createPostgresAnalyticsOpportunityStore,
  type Queryable
} from "../../../packages/storage/src/index.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const OPPORTUNITY_ID = "33333333-3333-4333-8333-333333333333";

const opportunityRow = {
  opportunity_id: OPPORTUNITY_ID,
  project_id: PROJECT_ID,
  project_name: "Marketing site",
  project_color_tag: "blue",
  service: "web",
  environment: "production",
  kind: "funnel_dropoff",
  status: "open",
  severity: "medium",
  confidence: "0.82",
  title: "Checkout dropoff increased",
  summary: "Payment-step exits increased for mobile sessions.",
  evidence: { sessions: 120 },
  related_incident_ids: ["44444444-4444-4444-8444-444444444444"],
  related_deploy_ids: ["deploy-123"],
  first_detected_at: "2026-07-01T00:00:00.000Z",
  last_detected_at: "2026-07-07T00:00:00.000Z",
  resolved_at: null,
  snoozed_until: null,
  bundle_generation_id: "55555555-5555-4555-8555-555555555555",
  bundle_status: "completed",
  bundle_created_at: "2026-07-07T00:01:00.000Z",
  bundle_updated_at: "2026-07-07T00:02:00.000Z",
  bundle_failure_reason: null
};

describe("analytics opportunity store", () => {
  it("lists project analytics opportunities with filters, cursor, and bundle metadata", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("FROM analytics_opportunities ao");
      expect(sqlText).toContain("LEFT JOIN LATERAL");
      expect(sqlText).toContain("ao.status = 'open'");
      expect(sqlText).toContain("ao.snoozed_until <= now()");
      expect(sqlText).toContain("ao.kind = $3");
      expect(sqlText).toContain("ao.last_detected_at < $4::timestamptz");
      expect(params).toEqual([
        ORGANIZATION_ID,
        PROJECT_ID,
        "funnel_dropoff",
        "2026-07-07T00:00:00.000Z",
        OPPORTUNITY_ID,
        1
      ]);

      return { rows: [opportunityRow] };
    });

    const store = createPostgresAnalyticsOpportunityStore({ query: queryMock as Queryable["query"] });

    await expect(
      store.listAnalyticsOpportunitiesForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        status: "open",
        kind: "funnel_dropoff",
        cursor: {
          last_detected_at: "2026-07-07T00:00:00.000Z",
          opportunity_id: OPPORTUNITY_ID
        },
        limit: 1
      })
    ).resolves.toEqual({
      opportunities: [{
        opportunity_id: OPPORTUNITY_ID,
        project_id: PROJECT_ID,
        project_name: "Marketing site",
        project_color_tag: "blue",
        service: "web",
        environment: "production",
        kind: "funnel_dropoff",
        status: "open",
        severity: "medium",
        confidence: 0.82,
        title: "Checkout dropoff increased",
        summary: "Payment-step exits increased for mobile sessions.",
        evidence: { sessions: 120 },
        related_incident_ids: ["44444444-4444-4444-8444-444444444444"],
        related_deploy_ids: ["deploy-123"],
        first_detected_at: "2026-07-01T00:00:00.000Z",
        last_detected_at: "2026-07-07T00:00:00.000Z",
        resolved_at: null,
        snoozed_until: null,
        bundle_generation_id: "55555555-5555-4555-8555-555555555555",
        bundle_status: "completed",
        bundle_created_at: "2026-07-07T00:01:00.000Z",
        bundle_updated_at: "2026-07-07T00:02:00.000Z",
        bundle_failure_reason: null
      }],
      next_cursor: `2026-07-07T00:00:00.000Z|${OPPORTUNITY_ID}`
    });
  });

  it("filters snoozed opportunities to active or indefinite snoozes", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("ao.status = 'snoozed'");
      expect(sqlText).toContain("ao.snoozed_until IS NULL");
      expect(sqlText).toContain("ao.snoozed_until > now()");
      expect(params).toEqual([
        ORGANIZATION_ID,
        PROJECT_ID,
        10
      ]);

      return { rows: [] };
    });
    const store = createPostgresAnalyticsOpportunityStore({ query: queryMock as Queryable["query"] });

    await expect(
      store.listAnalyticsOpportunitiesForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        status: "snoozed",
        limit: 10
      })
    ).resolves.toEqual({ opportunities: [], next_cursor: null });
  });

  it("lists organization opportunities with a globally stable cursor", async (): Promise<void> => {
    const queryMock = vi.fn(async (sqlText: string, params: unknown[]) => {
      expect(sqlText).toContain("p.organization_id = $1::uuid");
      expect(sqlText).not.toContain("ao.project_id = $2::uuid");
      expect(sqlText).toContain("ao.last_detected_at < $2::timestamptz");
      expect(sqlText).toContain("ORDER BY ao.last_detected_at DESC, ao.id::text DESC");
      expect(params).toEqual([
        ORGANIZATION_ID,
        "2026-07-07T00:00:00.000Z",
        OPPORTUNITY_ID,
        1
      ]);
      return { rows: [opportunityRow] };
    });
    const store = createPostgresAnalyticsOpportunityStore({ query: queryMock as Queryable["query"] });

    await expect(
      store.listAnalyticsOpportunitiesForOrganization({
        organization_id: ORGANIZATION_ID,
        cursor: {
          last_detected_at: "2026-07-07T00:00:00.000Z",
          opportunity_id: OPPORTUNITY_ID
        },
        limit: 1
      })
    ).resolves.toMatchObject({
      opportunities: [{ opportunity_id: OPPORTUNITY_ID, project_name: "Marketing site" }],
      next_cursor: `2026-07-07T00:00:00.000Z|${OPPORTUNITY_ID}`
    });
  });

  it("gets one project analytics opportunity or null", async (): Promise<void> => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [opportunityRow] })
      .mockResolvedValueOnce({ rows: [] });
    const store = createPostgresAnalyticsOpportunityStore({ query: queryMock as Queryable["query"] });

    await expect(
      store.getAnalyticsOpportunityForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        opportunity_id: OPPORTUNITY_ID
      })
    ).resolves.toMatchObject({
      opportunity: {
        opportunity_id: OPPORTUNITY_ID,
        bundle_status: "completed"
      }
    });
    await expect(
      store.getAnalyticsOpportunityForProject({
        organization_id: ORGANIZATION_ID,
        project_id: PROJECT_ID,
        opportunity_id: OPPORTUNITY_ID
      })
    ).resolves.toBeNull();
  });
});
