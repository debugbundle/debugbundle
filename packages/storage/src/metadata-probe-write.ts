import { ProjectProbeError } from "./project-probe-errors.js";
import { resolveProbeSigningContext } from "./metadata-probe-signing.js";
import { getTierCapabilities } from "../../shared-types/src/index.js";
import { randomUUID } from "node:crypto";
import { generateProbeTriggerToken } from "../../auth/src/index.js";
import { getRequiredStringField } from "./helpers.js";
import { runInTransaction } from "./transaction.js";
import type { PostgresMetadataStore, ProbeActivationRecord, Queryable } from "./types.js";
import {
  normalizeOrganizationPlan,
  type PostgresMetadataStoreOptions,
  recordProjectMetricDeltas
} from "./metadata-shared.js";

export function createMetadataProbeWrites(
  db: Queryable,
  options: PostgresMetadataStoreOptions = {}
): Pick<
  PostgresMetadataStore,
  | "createProbeActivationForProjectInOrganization"
  | "deactivateProbeActivationForProjectInOrganization"
> {
  const accountAnalyticsStore = options.accountAnalyticsStore;
  return {
    async createProbeActivationForProjectInOrganization(input) {
      return runInTransaction(db, async (tx) => {
        // Membership/configuration writes take this same root lock. Recheck access
        // after the fence, so a pre-cutover or revoked actor cannot commit a probe.
        await tx.query("SELECT debugbundle_assert_project_scope_write($1::uuid)", [
          input.project_id
        ]);
        const scoped = await tx.query<{
          organization_plan: string;
          actor_is_owner: boolean;
          origins: string[];
          root_id: string;
        }>(
          `
          SELECT COALESCE(o.plan,'free') AS organization_plan,(p.owner_user_id=$3::uuid) AS actor_is_owner,p.id AS root_id,debugbundle_project_origins($1::uuid) AS origins
          FROM projects p JOIN organizations o ON o.id=p.organization_id
          WHERE p.id=debugbundle_canonical_project($1::uuid) AND p.organization_id=$2 AND o.suspended_at IS NULL AND
            (p.owner_user_id=$3 OR EXISTS(SELECT 1 FROM project_members pm
              WHERE pm.project_id=p.id AND pm.user_id=$3))`,
          [input.project_id, input.organization_id, input.created_by_member_id]
        );
        const project = scoped.rows[0];
        if (!project) return null;
        if (
          !project.actor_is_owner &&
          !getTierCapabilities(project.organization_plan).shared_dashboards
        )
          throw new ProjectProbeError("shared_access_suspended", 403);
        if (!getTierCapabilities(project.organization_plan).remote_probes)
          throw new ProjectProbeError("upgrade_required", 403);
        const active = await tx.query<{ cnt: string }>(
          `
          SELECT count(*)::text AS cnt FROM probe_activations WHERE project_id=ANY(debugbundle_project_origins($1::uuid))
            AND deactivated_at IS NULL AND expires_at>now()`,
          [project.root_id]
        );
        if (Number(active.rows[0]?.cnt ?? "0") >= 5)
          return {
            organization_plan: normalizeOrganizationPlan(project.organization_plan),
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
        let origin = input.project_id,
          service = input.service;
        let definition: { id: string; origin_project_id: string; input_name: string } | undefined;
        if (service !== "*") {
          const known = await tx.query<{
            id: string;
            origin_project_id: string;
            input_name: string;
          }>(
            `
            SELECT d.id,d.origin_project_id,d.input_name FROM service_project_aliases a
            JOIN service_definitions d ON d.id=a.service_definition_id WHERE a.project_id=$1 AND a.name=$2`,
            [input.project_id, service]
          );
          definition = known.rows[0];
          if (!definition) {
            const observed = await tx.query<{
              id: string;
              origin_project_id: string;
              input_name: string;
            }>(
              `
              SELECT id,origin_project_id,input_name FROM service_definitions WHERE id=debugbundle_observe_service($1,$2)`,
              [input.project_id, service]
            );
            definition = observed.rows[0];
          }
          if (!definition || !project.origins.includes(definition.origin_project_id))
            throw new ProjectProbeError("probe_scope_invalid", 400);
          origin = definition.origin_project_id;
          service = definition.input_name;
        }
        const origins = definition ? [origin] : project.origins;
        const signing = await resolveProbeSigningContext(tx, {
          root_id: project.root_id,
          origin_id: origin,
          activation_origins: origins,
          ...(definition ? { definition } : {}),
          ...(input.sdk_project_id ? { sdk_project_id: input.sdk_project_id } : {}),
          ...(input.sdk_token_id ? { sdk_token_id: input.sdk_token_id } : {}),
          ...(input.sdk_service ? { sdk_service: input.sdk_service } : {})
        });
        const activationId = randomUUID();
        const trigger = generateProbeTriggerToken({
          projectId: signing.project_id,
          scopeOriginIds: signing.origins,
          payload: {
            activation_id: activationId,
            label_pattern: input.label_pattern,
            service: signing.service,
            environment: input.environment,
            trigger_expires_at: input.trigger_expires_at
          }
        });
        const inserted = await tx.query<
          ProbeActivationRecord & Record<string, unknown> & { created_at: string }
        >(
          `
          INSERT INTO probe_activations(id,project_id,created_by_member_id,label_pattern,service,environment,trigger_token_hash,
            trigger_expires_at,expires_at,scope_origin_ids,service_definition_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[],$11)
          RETURNING id AS activation_id,label_pattern,service,environment,created_at::text,expires_at::text,trigger_expires_at::text`,
          [
            activationId,
            origin,
            input.created_by_member_id,
            input.label_pattern,
            service,
            input.environment,
            trigger.hash,
            input.trigger_expires_at,
            input.expires_at,
            origins,
            definition?.id ?? null
          ]
        );
        const activation = inserted.rows[0];
        if (!activation) throw new Error("probe_activation_insert_failed");
        await recordProjectMetricDeltas(accountAnalyticsStore, tx, {
          organization_id: input.organization_id,
          occurred_at: activation.created_at,
          source: "remote_probe_activation_created",
          dedupe_key: `remote_probe_activation_created:${activationId}`,
          deltas: { remote_probe_activations_created: 1 }
        });
        return {
          organization_plan: normalizeOrganizationPlan(project.organization_plan),
          activation: {
            activation_id: activation.activation_id,
            label_pattern: activation.label_pattern,
            service: activation.service,
            environment: activation.environment,
            expires_at: activation.expires_at,
            trigger_expires_at: activation.trigger_expires_at
          },
          trigger_token: trigger.plaintext,
          runtime_project_id: signing.project_id,
          runtime_scope_origin_ids: signing.origins,
          runtime_service: signing.service
        };
      });
    },
    async deactivateProbeActivationForProjectInOrganization(input) {
      return runInTransaction(db, async (tx) => {
        await tx.query("SELECT debugbundle_assert_project_scope_write($1::uuid)", [
          input.project_id
        ]);
        const result = await tx.query<Record<string, unknown>>(
          `
          UPDATE probe_activations pa SET deactivated_at=$1 FROM projects p JOIN organizations o ON o.id=p.organization_id
          WHERE pa.id=$2 AND pa.project_id=ANY(debugbundle_project_origins($3::uuid))
            AND p.id=debugbundle_canonical_project($3::uuid) AND p.organization_id=$4 AND o.suspended_at IS NULL AND pa.deactivated_at IS NULL
            AND ($5::uuid IS NULL OR p.owner_user_id=$5 OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$5))
          RETURNING COALESCE(o.plan,'free') AS organization_plan,pa.id AS activation_id,pa.deactivated_at::text`,
          [
            input.deactivated_at,
            input.activation_id,
            input.project_id,
            input.organization_id,
            input.actor_user_id ?? null
          ]
        );
        const row = result.rows[0];
        if (!row) return null;
        await recordProjectMetricDeltas(accountAnalyticsStore, tx, {
          organization_id: input.organization_id,
          occurred_at: input.deactivated_at,
          source: "remote_probe_activation_expired",
          dedupe_key: `remote_probe_activation_expired:${input.activation_id}`,
          deltas: { remote_probe_activations_expired: 1 }
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
