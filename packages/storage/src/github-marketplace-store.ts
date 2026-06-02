import { randomUUID } from "node:crypto";

import type {
  GitHubMarketplaceAccountRecord,
  GitHubMarketplaceAccountUpsertInput,
  GitHubMarketplaceStore,
  Queryable
} from "./types.js";

function mapGitHubMarketplaceAccountRow(
  row: GitHubMarketplaceAccountRecord & Record<string, unknown>
): GitHubMarketplaceAccountRecord {
  return {
    id: row.id,
    organization_id: row.organization_id ?? null,
    marketplace_account_id: Number(row.marketplace_account_id),
    marketplace_account_login: row.marketplace_account_login,
    marketplace_account_type: row.marketplace_account_type,
    marketplace_account_node_id: row.marketplace_account_node_id ?? null,
    marketplace_listing_plan_id: Number(row.marketplace_listing_plan_id),
    marketplace_listing_plan_name: row.marketplace_listing_plan_name,
    marketplace_plan_price_model: row.marketplace_plan_price_model ?? null,
    billing_cycle: row.billing_cycle ?? null,
    unit_count: row.unit_count === null ? null : Number(row.unit_count),
    on_free_trial: row.on_free_trial === true,
    free_trial_ends_on: row.free_trial_ends_on ?? null,
    next_billing_date: row.next_billing_date ?? null,
    effective_date: row.effective_date,
    installation_id: row.installation_id === null ? null : Number(row.installation_id),
    marketplace_purchase_status: row.marketplace_purchase_status,
    last_event_id: row.last_event_id,
    last_event_action: row.last_event_action,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function createPostgresGitHubMarketplaceStore(db: Queryable): GitHubMarketplaceStore {
  return {
    async isEventProcessed(delivery_id: string): Promise<boolean> {
      const result = await db.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM processed_github_marketplace_events WHERE delivery_id = $1) AS exists`,
        [delivery_id]
      );

      return result.rows[0]?.exists ?? false;
    },

    async markEventProcessed(input): Promise<void> {
      await db.query(
        `
          INSERT INTO processed_github_marketplace_events (
            delivery_id,
            event_name,
            marketplace_account_id,
            action,
            processed_at
          )
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (delivery_id) DO NOTHING
        `,
        [input.delivery_id, input.event_name, input.marketplace_account_id, input.action]
      );
    },

    async upsertMarketplaceAccount(input: GitHubMarketplaceAccountUpsertInput): Promise<GitHubMarketplaceAccountRecord> {
      const recordIdResult = await db.query<{ id: string }>(
        `
          SELECT id
          FROM github_marketplace_accounts
          WHERE marketplace_account_id = $1
          LIMIT 1
        `,
        [input.marketplace_account_id]
      );
      const recordId = recordIdResult.rows[0]?.id ?? randomUUID();

      const result = await db.query<GitHubMarketplaceAccountRecord & Record<string, unknown>>(
        `
          INSERT INTO github_marketplace_accounts (
            id,
            organization_id,
            marketplace_account_id,
            marketplace_account_login,
            marketplace_account_type,
            marketplace_account_node_id,
            marketplace_listing_plan_id,
            marketplace_listing_plan_name,
            marketplace_plan_price_model,
            billing_cycle,
            unit_count,
            on_free_trial,
            free_trial_ends_on,
            next_billing_date,
            effective_date,
            installation_id,
            marketplace_purchase_status,
            last_event_id,
            last_event_action,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13::timestamptz,
            $14::timestamptz,
            $15::timestamptz,
            $16,
            $17,
            $18,
            $19,
            NOW(),
            NOW()
          )
          ON CONFLICT (marketplace_account_id)
          DO UPDATE SET
            organization_id = COALESCE(EXCLUDED.organization_id, github_marketplace_accounts.organization_id),
            marketplace_account_login = EXCLUDED.marketplace_account_login,
            marketplace_account_type = EXCLUDED.marketplace_account_type,
            marketplace_account_node_id = EXCLUDED.marketplace_account_node_id,
            marketplace_listing_plan_id = EXCLUDED.marketplace_listing_plan_id,
            marketplace_listing_plan_name = EXCLUDED.marketplace_listing_plan_name,
            marketplace_plan_price_model = EXCLUDED.marketplace_plan_price_model,
            billing_cycle = EXCLUDED.billing_cycle,
            unit_count = EXCLUDED.unit_count,
            on_free_trial = EXCLUDED.on_free_trial,
            free_trial_ends_on = EXCLUDED.free_trial_ends_on,
            next_billing_date = EXCLUDED.next_billing_date,
            effective_date = EXCLUDED.effective_date,
            installation_id = COALESCE(EXCLUDED.installation_id, github_marketplace_accounts.installation_id),
            marketplace_purchase_status = EXCLUDED.marketplace_purchase_status,
            last_event_id = EXCLUDED.last_event_id,
            last_event_action = EXCLUDED.last_event_action,
            updated_at = NOW()
          RETURNING
            id,
            organization_id::text AS organization_id,
            marketplace_account_id,
            marketplace_account_login,
            marketplace_account_type,
            marketplace_account_node_id,
            marketplace_listing_plan_id,
            marketplace_listing_plan_name,
            marketplace_plan_price_model,
            billing_cycle,
            unit_count,
            on_free_trial,
            free_trial_ends_on::text AS free_trial_ends_on,
            next_billing_date::text AS next_billing_date,
            effective_date::text AS effective_date,
            installation_id,
            marketplace_purchase_status,
            last_event_id,
            last_event_action,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          recordId,
          input.organization_id,
          input.marketplace_account_id,
          input.marketplace_account_login,
          input.marketplace_account_type,
          input.marketplace_account_node_id,
          input.marketplace_listing_plan_id,
          input.marketplace_listing_plan_name,
          input.marketplace_plan_price_model,
          input.billing_cycle,
          input.unit_count,
          input.on_free_trial,
          input.free_trial_ends_on,
          input.next_billing_date,
          input.effective_date,
          input.installation_id,
          input.marketplace_purchase_status,
          input.last_event_id,
          input.last_event_action
        ]
      );

      return mapGitHubMarketplaceAccountRow(result.rows[0]!);
    },

    async linkOrganizationToMarketplaceAccountByInstallationId(input): Promise<GitHubMarketplaceAccountRecord | null> {
      const result = await db.query<GitHubMarketplaceAccountRecord & Record<string, unknown>>(
        `
          UPDATE github_marketplace_accounts
          SET
            organization_id = $1,
            updated_at = NOW()
          WHERE installation_id = $2
          RETURNING
            id,
            organization_id::text AS organization_id,
            marketplace_account_id,
            marketplace_account_login,
            marketplace_account_type,
            marketplace_account_node_id,
            marketplace_listing_plan_id,
            marketplace_listing_plan_name,
            marketplace_plan_price_model,
            billing_cycle,
            unit_count,
            on_free_trial,
            free_trial_ends_on::text AS free_trial_ends_on,
            next_billing_date::text AS next_billing_date,
            effective_date::text AS effective_date,
            installation_id,
            marketplace_purchase_status,
            last_event_id,
            last_event_action,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [input.organization_id, input.installation_id]
      );

      const row = result.rows[0];
      return row === undefined ? null : mapGitHubMarketplaceAccountRow(row);
    }
  };
}
