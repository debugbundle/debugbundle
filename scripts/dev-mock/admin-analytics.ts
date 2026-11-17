import type { AdminAnalyticsSummary } from "../../apps/web/src/lib/api-types.js";
import type { MockResponse } from "./api.js";

/** Empty synthetic operator metrics. Never queries a database or telemetry. */
export function createAdminAnalyticsMocks(isSignedIn: () => boolean) {
  return {
    handle(method: string, path: string): MockResponse | undefined {
      if (!path.startsWith("/v1/admin/analytics/")) return undefined;
      if (!isSignedIn()) return { status: 401, body: { error: "invalid_session" } };
      if (method !== "GET")
        return { status: 503, body: { error: "local_preview_operation_unavailable" } };
      if (path.endsWith("/access-status")) return { status: 200, body: { status: "ready" } };
      const now = new Date(),
        end = now.toISOString();
      const window = (start: Date) => ({ starts_at: start.toISOString(), ends_at: end });
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      if (path.endsWith("/malformed-rejections"))
        return {
          status: 200,
          body: {
            breakdown: {
              generated_at: end,
              window: window(month),
              total_malformed_rejections_this_month: 0,
              top_sources: [],
              top_validation_failures: []
            }
          }
        };
      if (!path.endsWith("/summary"))
        return { status: 503, body: { error: "local_preview_operation_unavailable" } };
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const week = new Date(today);
      week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
      const summary: AdminAnalyticsSummary = {
        generated_at: end,
        collection_started_at: month.toISOString(),
        windows: {
          today: window(today),
          this_week: window(week),
          this_month: window(month),
          this_year: window(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)))
        },
        kpis: {
          active_accounts_today: 0,
          active_accounts_this_week: 0,
          active_accounts_this_month: 0,
          new_accounts_today: 0,
          new_accounts_this_week: 0,
          new_accounts_this_month: 0,
          deleted_accounts_this_month: 0,
          active_accounts_total: 0,
          deleted_accounts_total: 0
        },
        usage: {
          raw_events_accepted_this_month: 0,
          billable_events_counted_this_month: 0,
          incident_signal_events_this_month: 0,
          context_signal_events_this_month: 0,
          operational_signal_events_this_month: 0,
          cloud_verification_events_this_month: 0,
          local_verification_events_this_month: 0
        },
        incidents: {
          opened_this_month: 0,
          resolved_this_month: 0,
          reopened_this_month: 0,
          regressed_this_month: 0,
          occurrences_this_month: 0,
          high_severity_occurrences_this_month: 0,
          critical_severity_occurrences_this_month: 0,
          auto_detected_spikes_this_month: 0,
          resolution_rate_this_month: 0
        },
        bundles: {
          failure_created_this_month: 0,
          failure_updated_this_month: 0,
          failure_generation_failed_this_month: 0,
          improvement_created_this_month: 0,
          improvement_generation_failed_this_month: 0,
          reproductions_created_this_month: 0,
          reproductions_failed_this_month: 0
        },
        improvements: {
          opened_this_month: 0,
          resolved_this_month: 0,
          snoozed_this_month: 0,
          resolution_rate_this_month: 0,
          recurring_incident_opened_this_month: 0,
          post_deploy_regression_opened_this_month: 0,
          slow_request_opened_this_month: 0,
          request_failure_opened_this_month: 0,
          warning_log_opened_this_month: 0
        },
        billing: {
          trials_started_this_month: 0,
          trials_converted_this_month: 0,
          trials_expired_this_month: 0,
          plan_upgrades_this_month: 0,
          plan_downgrades_this_month: 0,
          capacity_units_purchased_this_month: 0,
          capacity_units_reduced_this_month: 0
        },
        health: {
          raw_events_rejected_this_month: 0,
          malformed_rejections_this_month: 0,
          rate_limited_rejections_this_month: 0,
          quota_rejections_this_month: 0,
          capture_policy_rejections_this_month: 0,
          capture_rule_rejections_this_month: 0,
          alert_deliveries_failed_this_month: 0,
          webhook_deliveries_failed_this_month: 0,
          weekly_reports_failed_this_month: 0,
          github_dispatches_failed_this_month: 0,
          webhooks_auto_disabled_this_month: 0,
          operational_emails_sent_this_month: 0,
          allowance_warning_emails_sent_this_month: 0,
          allowance_limit_emails_sent_this_month: 0
        }
      };
      return { status: 200, body: { summary } };
    }
  };
}
