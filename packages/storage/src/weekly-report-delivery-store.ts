import { randomUUID } from "node:crypto";
import { runInTransaction } from "./transaction.js";

import type { Queryable, WeeklyReportDeliveryStore } from "./types.js";

export function createPostgresWeeklyReportDeliveryStore(db: Queryable): WeeklyReportDeliveryStore {
  return {
    async claimWeeklyReportDelivery(input) {
      return runInTransaction(db, async (tx) => {
        // Acquire the project fence before a fresh READ COMMITTED history query.
        // NOWAIT also makes a scheduler selected before cutover retry safely.
        await tx.query("SELECT debugbundle_assert_canonical_project_write($1::uuid)", [
          input.project_id
        ]);
        const prior = await tx.query<{
          delivery_id: string;
          project_id: string;
          weekly_report_channel_id: string | null;
          status: string;
          last_error: string | null;
        }>(
          `SELECT d.id AS delivery_id,d.project_id,d.weekly_report_channel_id,d.status,d.last_error
          FROM weekly_report_deliveries d
          WHERE d.weekly_report_channel_id=ANY(ARRAY(
            SELECT c.id FROM weekly_report_channels c WHERE c.id=$1 AND c.project_id=$4 AND c.is_enabled AND c.channel=$5
            UNION SELECT a.legacy_channel_id FROM weekly_report_channel_aliases a JOIN weekly_report_channels c ON c.id=a.canonical_channel_id
              WHERE c.id=$1 AND c.project_id=$4 AND c.is_enabled AND c.channel=$5
          )) AND d.window_start=$2::timestamptz AND d.window_end=$3::timestamptz
          ORDER BY (d.status='failed' AND d.last_error IS DISTINCT FROM 'notification_suppressed') DESC,d.created_at,d.id
          LIMIT 1 FOR UPDATE`,
          [
            input.weekly_report_channel_id,
            input.window_start,
            input.window_end,
            input.project_id,
            input.channel
          ]
        );
        const existing = prior.rows[0];
        if (existing) {
          if (existing.status !== "failed" || existing.last_error === "notification_suppressed")
            return { delivery_id: existing.delivery_id, created: false };
          await tx.query(
            "UPDATE weekly_report_deliveries SET status='pending',last_error=NULL,updated_at=now() WHERE id=$1",
            [existing.delivery_id]
          );
          return {
            delivery_id: existing.delivery_id,
            created: true,
            project_id: existing.project_id,
            ...(existing.weekly_report_channel_id
              ? { weekly_report_channel_id: existing.weekly_report_channel_id }
              : {})
          };
        }
        const inserted = await tx.query<{ delivery_id: string }>(
          `INSERT INTO weekly_report_deliveries
          (id,weekly_report_channel_id,project_id,window_start,window_end,channel,status,last_error,delivered_at,created_at,updated_at)
          SELECT $1,$2,$3,$4::timestamptz,$5::timestamptz,$6,'pending',NULL,NULL,now(),now()
          FROM weekly_report_channels c WHERE c.id=$2 AND c.project_id=$3 AND c.is_enabled AND c.channel=$6
          ON CONFLICT(weekly_report_channel_id,window_start,window_end) WHERE weekly_report_channel_id IS NOT NULL DO NOTHING
          RETURNING id AS delivery_id`,
          [
            randomUUID(),
            input.weekly_report_channel_id,
            input.project_id,
            input.window_start,
            input.window_end,
            input.channel
          ]
        );
        const created = inserted.rows[0];
        if (!created) throw new Error("weekly_report_delivery_claim_failed");
        return { delivery_id: created.delivery_id, created: true };
      });
    },

    async markWeeklyReportDeliveryResult(input: {
      delivery_id: string;
      delivered: boolean;
      error_message: string | null;
    }): Promise<{ status: "delivered" | "failed" }> {
      const status = input.delivered ? "delivered" : "failed";
      const result = await db.query<{ status: "delivered" | "failed" }>(
        `
          UPDATE weekly_report_deliveries
          SET
            status = $2,
            last_error = $3,
            delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END,
            updated_at = now()
          WHERE id = $1
          RETURNING status
        `,
        [input.delivery_id, status, input.error_message]
      );

      return result.rows[0] ?? { status };
    }
  };
}
