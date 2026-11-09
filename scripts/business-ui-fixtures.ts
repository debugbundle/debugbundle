import { mkdir, writeFile } from "node:fs/promises";
import {
  createSession,
  createProject,
  createBillingSummary
} from "../tests/apps/web/web-test-helpers.js";
import {
  reportOrg,
  reportProject,
  reportId,
  reportRequest,
  reportDefinitionFixture,
  reportRunFixture,
  reportAllowanceFixture
} from "../tests/helpers/smart-reports.js";
import { reportDocumentFixture } from "../tests/helpers/report-document.js";
import { REFERRAL_TERMS_VERSION } from "../packages/referrals/src/referral-contracts.js";

// Synthetic fixtures only. Browser review never contacts the local or hosted API.
const owner = "55555555-5555-4555-8555-555555555555";
const member = "66666666-6666-4666-8666-666666666666";
const org = `/v1/organizations/${reportOrg}`;
const definition = reportDefinitionFixture();
const run = {
  ...reportRunFixture(),
  status: "factual_only",
  ai_status: "unavailable",
  published_at: "2026-11-07T00:00:00.000Z",
  expires_at: "2027-02-05T00:00:00.000Z"
};
const document = reportDocumentFixture();
const responses = {
  "/v1/auth/session": {
    session: createSession({
      user_id: owner,
      organization_id: reportOrg,
      organization_plan: "business",
      email: "owner@example.test"
    })
  },
  "/v1/organizations": {
    organizations: [
      { organization_id: reportOrg, name: "Example workspace", plan: "business", role: "owner" }
    ]
  },
  "/v1/projects": {
    projects: [
      {
        ...createProject({
          project_id: reportProject,
          organization_id: reportOrg,
          organization_plan: "business",
          name: "Production API"
        }),
        owner_user_id: owner,
        owner_email: "owner@example.test",
        effective_role: "owner"
      }
    ]
  },
  [`${org}/people`]: {
    people: [
      {
        user_id: owner,
        email: "owner@example.test",
        role: "owner",
        project_access: "all",
        default_project_role: "member",
        suspended_at: null,
        grants_paused_at: null,
        direct_project_count: 1
      },
      {
        user_id: member,
        email: "alex@example.test",
        role: "member",
        project_access: "selected",
        default_project_role: "viewer",
        suspended_at: null,
        grants_paused_at: null,
        direct_project_count: 1
      }
    ]
  },
  [`${org}/invites`]: { invites: [] },
  [`${org}/ownership-transfer`]: { transfer: null },
  [`/v1/projects/${reportProject}/members`]: {
    members: [
      {
        user_id: owner,
        email: "owner@example.test",
        role: "owner",
        membership_type: "owner",
        created_at: "2026-11-01T00:00:00.000Z",
        avatar_url: null
      }
    ]
  },
  [`${org}/report-definitions`]: { definitions: [definition] },
  [`${org}/report-definitions/${reportId}`]: { definition },
  [`${org}/report-definitions/${reportId}/allowance`]: { allowance: reportAllowanceFixture() },
  [`${org}/reports`]: { runs: [run], next_cursor: null },
  [`${org}/reports/${reportRequest}`]: { run },
  [`${org}/reports/${reportRequest}/document`]: { document, available_source_refs: [] },
  [`${org}/reports/${reportRequest}/pdf`]: {
    pdf: {
      run_id: reportRequest,
      status: "not_requested",
      retry_after_seconds: null
    }
  },
  [`${org}/reports/${reportRequest}/deliveries`]: { deliveries: [] },
  "/v1/referrals/partner": {
    partner: null,
    share_url: null,
    enrollment_enabled: true,
    terms_version: REFERRAL_TERMS_VERSION
  },
  "/v1/referrals/earnings": { balance: null, operator_access: false },
  "/v1/referrals/attribution": { attribution: null, pending_code: null },
  "/v1/billing/offers/change": {
    subscription: {
      plan: "business",
      interval: "year",
      currency: "usd",
      additional_capacity_units: 0,
      base_amount_minor: 58800,
      capacity_unit_amount_minor: 3000,
      term_starts_at: "2026-11-01T00:00:00.000Z",
      term_ends_at: "2027-11-01T00:00:00.000Z"
    },
    pending_change: null
  },
  "/v1/billing": {
    billing: createBillingSummary({
      plan: "business",
      stripe_customer_id: "cus_visual_fixture",
      billing_state: "active",
      usage_window: { starts_at: "2026-11-01T00:00:00.000Z", ends_at: "2026-12-01T00:00:00.000Z" }
    })
  }
};
await mkdir(".tmp/business-audit/browser", { recursive: true });
await writeFile(
  ".tmp/business-audit/browser/dashboard-fixtures.json",
  JSON.stringify(
    {
      responses,
      reportPath: `/reports/${reportOrg}/${reportRequest}`,
      editorPath: `/reports/definitions/${reportId}/edit`
    },
    null,
    2
  )
);
