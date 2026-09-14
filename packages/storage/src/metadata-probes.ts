import { randomUUID } from "node:crypto";
import { generateProbeTriggerToken } from "../../auth/src/index.js";
import { type TierName } from "../../shared-types/src/index.js";
import { getRequiredStringField } from "./helpers.js";
import { runInTransaction } from "./transaction.js";
import type { PostgresMetadataStore, ProbeActivationRecord, Queryable } from "./types.js";
import {
  normalizeOrganizationPlan,
  type PostgresMetadataStoreOptions,
  recordProjectMetricDeltas
} from "./metadata-shared.js";

export function createMetadataProbes(
  db: Queryable,
  options: PostgresMetadataStoreOptions = {}
): Pick<
  PostgresMetadataStore,
  | "listActiveProbesForProject"
  | "listActiveProbesForProjectInOrganization"
  | "createProbeActivationForProjectInOrganization"
  | "deactivateProbeActivationForProjectInOrganization"
> {
  const accountAnalyticsStore = options.accountAnalyticsStore;
  return {
    async listActiveProbesForProject(input: {
      project_id: string;
      now: string;
    }): Promise<ProbeActivationRecord[]> {
      const result = await db.query<ProbeActivationRecord & Record<string, unknown>>(
        `
          SELECT
            id AS activation_id,
            label_pattern,
            service,
            environment,
            expires_at::text AS expires_at,
            trigger_expires_at::text AS trigger_expires_at
          FROM probe_activations
          WHERE project_id = $1
            AND deactivated_at IS NULL
            AND expires_at > $2::timestamptz
          ORDER BY created_at DESC
        `,
        [input.project_id, input.now]
      );

      return result.rows;
    },

    async listActiveProbesForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      now: string;
    }): Promise<{ organization_plan: TierName; activations: ProbeActivationRecord[] } | null> {
      const scopedProject = await db.query<Record<string, unknown>>(
        `
          SELECT p.id, COALESCE(o.plan, 'free') AS organization_plan
          FROM projects p
          JOIN organizations o ON o.id = p.organization_id
          WHERE p.id = $1
            AND p.organization_id = $2
          LIMIT 1
        `,
        [input.project_id, input.organization_id]
      );

      const project = scopedProject.rows[0];
      if (project === undefined) {
        return null;
      }

      const activations = await db.query<ProbeActivationRecord & Record<string, unknown>>(
        `
          SELECT
            id AS activation_id,
            label_pattern,
            service,
            environment,
            expires_at::text AS expires_at,
            trigger_expires_at::text AS trigger_expires_at
          FROM probe_activations
          WHERE project_id = $1
            AND deactivated_at IS NULL
            AND expires_at > $2::timestamptz
          ORDER BY created_at DESC
        `,
        [input.project_id, input.now]
      );

      return {
        organization_plan: normalizeOrganizationPlan(project["organization_plan"]),
        activations: activations.rows
      };
    },

    async createProbeActivationForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      created_by_member_id: string;
      label_pattern: string;
      service: string;
      environment: string;
      expires_at: string;
      trigger_expires_at: string;
    }): Promise<{
      organization_plan: TierName;
      activation: ProbeActivationRecord;
      trigger_token: string;
      concurrent_limit_exceeded?: boolean;
    } | null> {
      const activationId = randomUUID();
      const triggerToken = generateProbeTriggerToken({
        projectId: input.project_id,
        payload: {
          activation_id: activationId,
          label_pattern: input.label_pattern,
          service: input.service,
          environment: input.environment,
          trigger_expires_at: input.trigger_expires_at
        }
      });
      return runInTransaction(db, async (tx) => {
        const scopedProject = await tx.query<Record<string, unknown>>(
          `
            SELECT p.id, COALESCE(o.plan, 'free') AS organization_plan
            FROM projects p
            JOIN organizations o ON o.id = p.organization_id
            WHERE p.id = $1
              AND p.organization_id = $2
            LIMIT 1
          `,
          [input.project_id, input.organization_id]
        );

        const project = scopedProject.rows[0];
        if (project === undefined) {
          return null;
        }

        /** Max 5 concurrent active (non-expired, non-deactivated) activations per project (FR-PRB-05). */
        const countResult = await tx.query<{ cnt: string }>(
          `
            SELECT COUNT(*)::text AS cnt
            FROM probe_activations
            WHERE project_id = $1
              AND deactivated_at IS NULL
              AND expires_at > now()
          `,
          [input.project_id]
        );
        const activeCount = Number(countResult.rows[0]?.cnt ?? "0");
        if (activeCount >= 5) {
          return {
            organization_plan: normalizeOrganizationPlan(project["organization_plan"]),
            activation: {
              activation_id: "",
              label_pattern: "",
              service: "",
              environment: "",
              expires_at: "",
              trigger_expires_at: ""
            },
            trigger_token: "",
            concurrent_limit_exceeded: true
          };
        }

        const inserted = await tx.query<
          ProbeActivationRecord & Record<string, unknown> & { created_at: string }
        >(
          `
            INSERT INTO probe_activations (
              id,
              project_id,
              created_by_member_id,
              label_pattern,
              service,
              environment,
              trigger_token_hash,
              trigger_expires_at,
              expires_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
            RETURNING
              id AS activation_id,
              label_pattern,
              service,
              environment,
              created_at::text AS created_at,
              expires_at::text AS expires_at,
              trigger_expires_at::text AS trigger_expires_at
          `,
          [
            activationId,
            input.project_id,
            input.created_by_member_id,
            input.label_pattern,
            input.service,
            input.environment,
            triggerToken.hash,
            input.trigger_expires_at,
            input.expires_at
          ]
        );

        const activation = inserted.rows[0];
        if (activation === undefined) {
          throw new Error("probe_activation_insert_failed");
        }

        await recordProjectMetricDeltas(accountAnalyticsStore, tx, {
          organization_id: input.organization_id,
          occurred_at: activation.created_at,
          source: "remote_probe_activation_created",
          dedupe_key: `remote_probe_activation_created:${activation.activation_id}`,
          deltas: {
            remote_probe_activations_created: 1
          }
        });

        return {
          organization_plan: normalizeOrganizationPlan(project["organization_plan"]),
          activation,
          trigger_token: triggerToken.plaintext
        };
      });
    },

    async deactivateProbeActivationForProjectInOrganization(input: {
      organization_id: string;
      project_id: string;
      activation_id: string;
      deactivated_at: string;
    }): Promise<{
      organization_plan: TierName;
      deactivated: { activation_id: string; deactivated_at: string };
    } | null> {
      return runInTransaction(db, async (tx) => {
        const result = await tx.query<Record<string, unknown>>(
          `
            UPDATE probe_activations pa
            SET deactivated_at = $1
            FROM projects p
            WHERE pa.id = $2
              AND pa.project_id = $3
              AND pa.project_id = p.id
              AND p.organization_id = $4
              AND pa.deactivated_at IS NULL
            RETURNING
              COALESCE((SELECT o.plan FROM organizations o WHERE o.id = p.organization_id), 'free') AS organization_plan,
              pa.id AS activation_id,
              pa.deactivated_at::text AS deactivated_at
          `,
          [input.deactivated_at, input.activation_id, input.project_id, input.organization_id]
        );

        const row = result.rows[0];
        if (row === undefined) {
          return null;
        }

        await recordProjectMetricDeltas(accountAnalyticsStore, tx, {
          organization_id: input.organization_id,
          occurred_at: input.deactivated_at,
          source: "remote_probe_activation_expired",
          dedupe_key: `remote_probe_activation_expired:${input.activation_id}`,
          deltas: {
            remote_probe_activations_expired: 1
          }
        });

        return {
          organization_plan: normalizeOrganizationPlan(row["organization_plan"]),
          deactivated: {
            activation_id: getRequiredStringField(row, "activation_id"),
            deactivated_at: getRequiredStringField(row, "deactivated_at")
          }
        };
      });
    }
  };
}
