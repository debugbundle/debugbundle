import type { TierName } from "../../shared-types/src/index.js";
import { getTierCapabilities } from "../../shared-types/src/index.js";

import type { Queryable } from "./types.js";

export interface OrganizationPlanCleanupSummary {
  suspended_project_invites: number;
  suspended_project_members: number;
  suspended_slack_alert_rules: number;
  terminalized_slack_alert_deliveries: number;
  terminalized_slack_weekly_report_deliveries: number;
  suspended_slack_weekly_report_channels: number;
  suspended_slack_destinations: number;
  suspended_probe_activations: number;
  terminalized_github_dispatch_deliveries: number;
  suspended_github_dispatch_rules: number;
  suspended_github_installations: number;
  suspended_improvement_settings_projects: number;
  suspended_improvement_opportunities: number;
}

export interface OrganizationPlanCleanupService {
  cleanupOrganizationForPlan(input: {
    organization_id: string;
    plan: TierName;
    now?: string;
  }): Promise<OrganizationPlanCleanupSummary>;
}

const EMPTY_CLEANUP_SUMMARY: OrganizationPlanCleanupSummary = {
  suspended_project_invites: 0,
  suspended_project_members: 0,
  suspended_slack_alert_rules: 0,
  terminalized_slack_alert_deliveries: 0,
  terminalized_slack_weekly_report_deliveries: 0,
  suspended_slack_weekly_report_channels: 0,
  suspended_slack_destinations: 0,
  suspended_probe_activations: 0,
  terminalized_github_dispatch_deliveries: 0,
  suspended_github_dispatch_rules: 0,
  suspended_github_installations: 0,
  suspended_improvement_settings_projects: 0,
  suspended_improvement_opportunities: 0
};

function getChangedRowCount(result: { rows: unknown[]; rowCount?: number | null }): number {
  return typeof result.rowCount === "number" ? result.rowCount : result.rows.length;
}

export function createOrganizationPlanCleanupService(db: Queryable): OrganizationPlanCleanupService {
  return {
    async cleanupOrganizationForPlan(input): Promise<OrganizationPlanCleanupSummary> {
      const capabilities = getTierCapabilities(input.plan);
      const summary: OrganizationPlanCleanupSummary = { ...EMPTY_CLEANUP_SUMMARY };

      if (!capabilities.member_invites) {
        const result = await db.query(
          `
            SELECT invites.id
            FROM projects p
            JOIN project_invites invites ON invites.project_id = p.id
            WHERE invites.project_id = p.id
              AND p.organization_id = $1::uuid
              AND invites.accepted_at IS NULL
              AND invites.canceled_at IS NULL
          `,
          [input.organization_id]
        );
        summary.suspended_project_invites = getChangedRowCount(result);
      }

      if (!capabilities.shared_dashboards) {
        const result = await db.query(
          `
            SELECT members.id
            FROM projects p
            JOIN project_members members ON members.project_id = p.id
            WHERE members.project_id = p.id
              AND p.organization_id = $1::uuid
          `,
          [input.organization_id]
        );
        summary.suspended_project_members = getChangedRowCount(result);
      }

      if (!capabilities.slack_integration) {
        const alertRulesResult = await db.query(
          `
            SELECT alerts.id
            FROM projects p
            JOIN alert_rules alerts ON alerts.project_id = p.id
            WHERE alerts.project_id = p.id
              AND p.organization_id = $1::uuid
              AND alerts.channel = 'slack'
          `,
          [input.organization_id]
        );
        summary.suspended_slack_alert_rules = getChangedRowCount(alertRulesResult);

        const alertDeliveriesResult = await db.query(
          `
            UPDATE alert_deliveries deliveries
            SET
              status = 'failed',
              last_error = 'tier_downgrade_removed_feature',
              updated_at = now()
            FROM alert_rules alerts
            JOIN projects p ON p.id = alerts.project_id
            WHERE deliveries.alert_id = alerts.id
              AND p.organization_id = $1::uuid
              AND alerts.channel = 'slack'
              AND deliveries.status IN ('pending', 'retrying')
          `,
          [input.organization_id]
        );
        summary.terminalized_slack_alert_deliveries = getChangedRowCount(alertDeliveriesResult);

        const weeklyDeliveriesResult = await db.query(
          `
            UPDATE weekly_report_deliveries deliveries
            SET
              weekly_report_channel_id = NULL,
              status = CASE
                WHEN deliveries.status = 'pending' THEN 'failed'
                ELSE deliveries.status
              END,
              last_error = CASE
                WHEN deliveries.status = 'pending' THEN 'tier_downgrade_removed_feature'
                ELSE deliveries.last_error
              END,
              updated_at = now()
            FROM weekly_report_channels channels
            JOIN projects p ON p.id = channels.project_id
            WHERE deliveries.weekly_report_channel_id = channels.id
              AND p.organization_id = $1::uuid
              AND channels.channel = 'slack'
          `,
          [input.organization_id]
        );
        summary.terminalized_slack_weekly_report_deliveries = getChangedRowCount(
          weeklyDeliveriesResult
        );

        const weeklyChannelsResult = await db.query(
          `
            SELECT channels.id
            FROM projects p
            JOIN weekly_report_channels channels ON channels.project_id = p.id
            WHERE channels.project_id = p.id
              AND p.organization_id = $1::uuid
              AND channels.channel = 'slack'
          `,
          [input.organization_id]
        );
        summary.suspended_slack_weekly_report_channels = getChangedRowCount(weeklyChannelsResult);

        const slackDestinationsResult = await db.query(
          `
            SELECT id
            FROM slack_destinations
            WHERE organization_id = $1::uuid
          `,
          [input.organization_id]
        );
        summary.suspended_slack_destinations = getChangedRowCount(slackDestinationsResult);
      }

      if (!capabilities.remote_probes) {
        const result = await db.query(
          `
            SELECT activations.id
            FROM projects p
            JOIN probe_activations activations ON activations.project_id = p.id
            WHERE activations.project_id = p.id
              AND p.organization_id = $1::uuid
              AND activations.deactivated_at IS NULL
          `,
          [input.organization_id]
        );
        summary.suspended_probe_activations = getChangedRowCount(result);
      }

      if (!capabilities.github_automation) {
        const deliveriesResult = await db.query(
          `
            UPDATE github_dispatch_deliveries deliveries
            SET
              status = CASE
                WHEN deliveries.status IN ('pending', 'retrying') THEN 'skipped'
                ELSE deliveries.status
              END,
              next_attempt_at = CASE
                WHEN deliveries.status IN ('pending', 'retrying') THEN NULL
                ELSE deliveries.next_attempt_at
              END,
              last_error = CASE
                WHEN deliveries.status IN ('pending', 'retrying') THEN 'tier_downgrade_removed_feature'
                ELSE deliveries.last_error
              END,
              updated_at = now()
            FROM projects p
            WHERE deliveries.project_id = p.id
              AND p.organization_id = $1::uuid
          `,
          [input.organization_id]
        );
        summary.terminalized_github_dispatch_deliveries = getChangedRowCount(deliveriesResult);

        const rulesResult = await db.query(
          `
            SELECT rules.id
            FROM projects p
            JOIN github_dispatch_rules rules ON rules.project_id = p.id
            WHERE rules.project_id = p.id
              AND p.organization_id = $1::uuid
          `,
          [input.organization_id]
        );
        summary.suspended_github_dispatch_rules = getChangedRowCount(rulesResult);

        const installationsResult = await db.query(
          `
            SELECT id
            FROM github_installations
            WHERE organization_id = $1::uuid
          `,
          [input.organization_id]
        );
        summary.suspended_github_installations = getChangedRowCount(installationsResult);
      }

      if (!capabilities.cloud_improvement_bundles) {
        const settingsResult = await db.query(
          `
            SELECT id
            FROM projects
            WHERE organization_id = $1::uuid
              AND automated_improvement_bundles_enabled = true
          `,
          [input.organization_id]
        );
        summary.suspended_improvement_settings_projects = getChangedRowCount(settingsResult);

        const opportunitiesResult = await db.query(
          `
            SELECT opportunities.id
            FROM projects p
            JOIN improvement_opportunities opportunities ON opportunities.project_id = p.id
            WHERE opportunities.project_id = p.id
              AND p.organization_id = $1::uuid
          `,
          [input.organization_id]
        );
        summary.suspended_improvement_opportunities = getChangedRowCount(opportunitiesResult);
      }

      return summary;
    }
  };
}
