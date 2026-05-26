import { randomUUID } from "node:crypto";

import type { Queryable, WeeklyReportDeliveryStore } from "./types.js";

export function createPostgresWeeklyReportDeliveryStore(db: Queryable): WeeklyReportDeliveryStore {
  return {
    async claimWeeklyReportDelivery(input: {
      weekly_report_channel_id: string;
      project_id: string;
      window_start: string;
      window_end: string;
      channel: "email" | "slack";
    }): Promise<{ delivery_id: string; created: boolean }> {
      const result = await db.query<{ delivery_id: string; claimed: boolean }>(
        `
          WITH claimed AS (
            INSERT INTO weekly_report_deliveries (
              id,
              weekly_report_channel_id,
              project_id,
              window_start,
              window_end,
              channel,
              status,
              last_error,
              delivered_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, 'pending', NULL, NULL, now(), now())
            ON CONFLICT (weekly_report_channel_id, window_start, window_end)
            WHERE weekly_report_channel_id IS NOT NULL
            DO UPDATE
            SET
              status = 'pending',
              last_error = NULL,
              updated_at = now()
            WHERE weekly_report_deliveries.status = 'failed'
            RETURNING id AS delivery_id, true AS claimed
          )
          SELECT delivery_id, claimed
          FROM claimed

          UNION ALL

          SELECT wrd.id AS delivery_id, false AS claimed
          FROM weekly_report_deliveries wrd
          WHERE wrd.weekly_report_channel_id = $2
            AND wrd.window_start = $4::timestamptz
            AND wrd.window_end = $5::timestamptz
            AND NOT EXISTS (SELECT 1 FROM claimed)
          LIMIT 1
        `,
        [
          randomUUID(),
          input.weekly_report_channel_id,
          input.project_id,
          input.window_start,
          input.window_end,
          input.channel
        ]
      );

      const row = result.rows[0];
      if (row === undefined) {
        throw new Error("weekly_report_delivery_claim_failed");
      }

      return {
        delivery_id: row.delivery_id,
        created: row.claimed
      };
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
