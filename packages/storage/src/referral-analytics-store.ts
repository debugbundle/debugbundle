import { z } from "zod";
import {
  ReferralAnalyticsQuerySchema,
  ReferralAnalyticsSchema,
  type ReferralAnalytics,
  type ReferralAnalyticsDays
} from "../../referrals/src/referral-analytics-contract.js";
import type { Queryable } from "./types.js";
import { REFERRAL_VISIT_MIGRATION } from "./referral-visit-schema.js";

export async function readReferralAnalytics(
  db: Queryable,
  userId: string,
  days: ReferralAnalyticsDays,
  asOf: string
): Promise<ReferralAnalytics | null> {
  const user = z.uuid().parse(userId);
  const range = Number(ReferralAnalyticsQuerySchema.parse({ days }).days);
  const end = z.iso.datetime().parse(asOf);
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - range + 1);
  // The event dates have different meanings. Aggregate each source
  // separately to avoid counting invoices or ledger adjustments as customers.
  const { rows } = await db.query<{
    date: string;
    tracking_started_at: string;
    visits: string | null;
    referred_accounts: string;
    first_paid_referrals: string;
    net_commission_minor: string;
  }>(
    `WITH creator AS (
      SELECT p.id FROM referral_partners p JOIN users u ON u.id=p.user_id
      WHERE u.id=$1 AND u.email_verified_at IS NOT NULL
    ), coverage AS (
      SELECT applied_at FROM storage_migration_ledger WHERE id=$5
    ), visits AS (
      SELECT (v.visited_at AT TIME ZONE 'UTC')::date AS day,count(*) AS total
      FROM creator c JOIN offer_codes o ON o.partner_id=c.id
      JOIN referral_link_visits v ON v.code_id=o.id
      WHERE v.visited_at >= $2::timestamptz AND v.visited_at < $3::timestamptz
      GROUP BY 1
    ), accounts AS (
      SELECT (a.created_at AT TIME ZONE 'UTC')::date AS day,count(*) AS total
      FROM creator c JOIN referral_attributions a ON a.partner_id=c.id
      WHERE a.created_at >= $2::timestamptz AND a.created_at < $3::timestamptz
      GROUP BY 1
    ), paid AS (
      SELECT (p.first_paid_service_starts_at AT TIME ZONE 'UTC')::date AS day,count(*) AS total
      FROM creator c JOIN referral_attributions a ON a.partner_id=c.id
      JOIN referral_commission_periods p ON p.attribution_id=a.id AND p.status='eligible'
      WHERE p.first_paid_service_starts_at >= $2::timestamptz
        AND p.first_paid_service_starts_at < $3::timestamptz
      GROUP BY 1
    ), commission AS (
      SELECT (l.recorded_at AT TIME ZONE 'UTC')::date AS day,sum(l.amount_minor) AS total
      FROM creator c JOIN referral_commission_ledger l ON l.partner_id=c.id
      WHERE l.recorded_at >= $2::timestamptz AND l.recorded_at < $3::timestamptz
      GROUP BY 1
    ), dates AS (
      SELECT ($2::timestamptz AT TIME ZONE 'UTC')::date + offset_day AS day
      FROM generate_series(0, $4::int - 1) AS offset_day
    )
    SELECT to_char(d.day,'YYYY-MM-DD') AS date,coverage.applied_at::text AS tracking_started_at,
      CASE WHEN d.day >= (coverage.applied_at AT TIME ZONE 'UTC')::date AND coverage.applied_at < $3::timestamptz
        THEN coalesce(v.total,0)::text END AS visits,
      coalesce(a.total,0)::text AS referred_accounts,
      coalesce(p.total,0)::text AS first_paid_referrals,coalesce(l.total,0)::text AS net_commission_minor
    FROM creator CROSS JOIN dates d CROSS JOIN coverage
    LEFT JOIN visits v ON v.day=d.day
    LEFT JOIN accounts a ON a.day=d.day
    LEFT JOIN paid p ON p.day=d.day
    LEFT JOIN commission l ON l.day=d.day
    ORDER BY d.day`,
    [user, start.toISOString(), end, range, REFERRAL_VISIT_MIGRATION.id]
  );
  if (!rows.length) return null;
  const daily = rows.map((row) => ({
    date: row.date,
    visits: row.visits === null ? null : Number(row.visits),
    referred_accounts: Number(row.referred_accounts),
    first_paid_referrals: Number(row.first_paid_referrals),
    net_commission_minor: Number(row.net_commission_minor)
  }));
  const totals = {
    visits: null as number | null,
    referred_accounts: 0,
    first_paid_referrals: 0,
    net_commission_minor: 0
  };
  for (const day of daily) {
    if (day.visits !== null) totals.visits = (totals.visits ?? 0) + day.visits;
    totals.referred_accounts += day.referred_accounts;
    totals.first_paid_referrals += day.first_paid_referrals;
    totals.net_commission_minor += day.net_commission_minor;
  }
  return ReferralAnalyticsSchema.parse({
    as_of: end,
    visit_tracking_started_at: new Date(rows[0]!.tracking_started_at).toISOString(),
    currency: "usd",
    totals,
    daily
  });
}
