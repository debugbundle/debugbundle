import type {
  CaptureRule,
  CaptureRuleAction,
  CaptureRuleMatcher,
  CaptureRuleSampleEventClass,
  CaptureRuleUpdate
} from "../../shared-types/src/index.js";
import type { Queryable } from "./types.js";

type CaptureRuleRow = Omit<
  CaptureRule,
  "sample_rate" | "hit_count" | "expires_at" | "last_matched_at" | "created_at" | "updated_at"
> & {
  sample_rate: number | string | null;
  hit_count: number | string;
  expires_at: string | Date | null;
  last_matched_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export interface CaptureRuleStore {
  getCaptureRuleById(input: { id: string; project_id: string }): Promise<CaptureRule | null>;
  listCaptureRulesByProjectId(projectId: string): Promise<CaptureRule[]>;
  listActiveCaptureRulesByProjectId(input: {
    project_id: string;
    now: string;
  }): Promise<CaptureRule[]>;
  createCaptureRule(input: {
    id: string;
    project_id: string;
    name: string;
    description?: string | null;
    enabled?: boolean;
    action: CaptureRuleAction;
    matcher: CaptureRuleMatcher;
    sample_rate?: number | null;
    sample_event_class?: CaptureRuleSampleEventClass | null;
    created_by_user_id?: string | null;
    created_from_incident_id?: string | null;
    created_from_event_id?: string | null;
    expires_at?: string | null;
  }): Promise<CaptureRule>;
  updateCaptureRule(
    input: { id: string; project_id: string } & CaptureRuleUpdate
  ): Promise<CaptureRule | null>;
  deleteCaptureRule(input: { id: string; project_id: string }): Promise<boolean>;
  recordCaptureRuleMatch(input: {
    id: string;
    project_id: string;
    matched_at: string;
  }): Promise<void>;
}

function selectColumns(viewParameter?: string): string {
  return `
    id,
    project_id,
    scope_origin_ids,
    ${viewParameter ? `CASE WHEN ${viewParameter}::uuid=debugbundle_canonical_project(${viewParameter}::uuid) THEN ${viewParameter}::uuid ELSE filter_project_id END AS filter_project_id` : "filter_project_id"},
    name,
    description,
    enabled,
    action,
    ${viewParameter ? `debugbundle_rule_view_matcher(${viewParameter}::uuid,COALESCE(filter_project_id,project_id),matcher) AS matcher` : "matcher"},
    sample_rate,
    sample_event_class,
    created_by_user_id,
    created_from_incident_id,
    created_from_event_id,
    expires_at,
    hit_count,
    last_matched_at,
    created_at,
    updated_at
  `;
}

function toIsoString(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value).toISOString();
}

function normalizeCaptureRuleRow(row: CaptureRuleRow): CaptureRule {
  return {
    ...row,
    sample_rate: row.sample_rate === null ? null : Number(row.sample_rate),
    hit_count: Number(row.hit_count),
    expires_at: toIsoString(row.expires_at),
    last_matched_at: toIsoString(row.last_matched_at),
    created_at: toIsoString(row.created_at) ?? new Date(row.created_at).toISOString(),
    updated_at: toIsoString(row.updated_at) ?? new Date(row.updated_at).toISOString()
  };
}

export function createPostgresCaptureRuleStore(db: Queryable): CaptureRuleStore {
  return {
    async getCaptureRuleById(input) {
      const result = await db.query<CaptureRuleRow>(
        `
          SELECT ${selectColumns("$2")}
          FROM capture_rules
          WHERE id = $1 AND project_id=ANY(debugbundle_project_origins($2::uuid))
          LIMIT 1
        `,
        [input.id, input.project_id]
      );

      return result.rows[0] === undefined ? null : normalizeCaptureRuleRow(result.rows[0]);
    },

    async listCaptureRulesByProjectId(projectId) {
      const result = await db.query<CaptureRuleRow>(
        `
          SELECT ${selectColumns("$1")}
          FROM capture_rules
          WHERE project_id=ANY(debugbundle_project_origins($1::uuid))
          ORDER BY updated_at DESC, created_at DESC, id ASC
        `,
        [projectId]
      );

      return result.rows.map(normalizeCaptureRuleRow);
    },

    async listActiveCaptureRulesByProjectId(input) {
      const result = await db.query<CaptureRuleRow & { runtime_service_names?: string[] | null }>(
        `
        SELECT ${selectColumns()},debugbundle_rule_service_names(COALESCE(filter_project_id,project_id),$1::uuid,matcher->'services') AS runtime_service_names
        FROM capture_rules
        WHERE project_id=ANY(debugbundle_project_origins(debugbundle_canonical_project($1::uuid)))
          AND $1::uuid=ANY(COALESCE(scope_origin_ids,ARRAY[project_id]))
          AND enabled=TRUE AND (expires_at IS NULL OR expires_at>$2::timestamptz)
        ORDER BY updated_at DESC,created_at DESC,id ASC`,
        [input.project_id, input.now]
      );
      return result.rows.flatMap(({ runtime_service_names, ...row }) => {
        if (runtime_service_names?.length === 0) return [];
        const record = normalizeCaptureRuleRow(row);
        return [
          {
            ...record,
            matcher: runtime_service_names
              ? { ...record.matcher, services: runtime_service_names }
              : record.matcher
          }
        ];
      });
    },

    async createCaptureRule(input) {
      const result = await db.query<CaptureRuleRow>(
        `
          INSERT INTO capture_rules (
            id,
            project_id,
            name,
            description,
            enabled,
            action,
            matcher,
            sample_rate,
            sample_event_class,
            created_by_user_id,
            created_from_incident_id,
            created_from_event_id,
            expires_at,
            hit_count,
            last_matched_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, 0, NULL, NOW(), NOW())
          RETURNING ${selectColumns()}
        `,
        [
          input.id,
          input.project_id,
          input.name,
          input.description ?? null,
          input.enabled ?? true,
          input.action,
          JSON.stringify(input.matcher),
          input.sample_rate ?? null,
          input.sample_event_class ?? null,
          input.created_by_user_id ?? null,
          input.created_from_incident_id ?? null,
          input.created_from_event_id ?? null,
          input.expires_at ?? null
        ]
      );

      return normalizeCaptureRuleRow(result.rows[0]!);
    },

    async updateCaptureRule(input) {
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (input.name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(input.name);
        paramIndex += 1;
      }

      if (input.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(input.description);
        paramIndex += 1;
      }

      if (input.enabled !== undefined) {
        updates.push(`enabled = $${paramIndex}`);
        params.push(input.enabled);
        paramIndex += 1;
      }

      if (input.action !== undefined) {
        updates.push(`action = $${paramIndex}`);
        params.push(input.action);
        paramIndex += 1;
      }

      if (input.matcher !== undefined) {
        updates.push(`matcher = $${paramIndex}::jsonb`);
        params.push(JSON.stringify(input.matcher));
        paramIndex += 1;
      }

      if (input.sample_rate !== undefined) {
        updates.push(`sample_rate = $${paramIndex}`);
        params.push(input.sample_rate);
        paramIndex += 1;
      }

      if (input.sample_event_class !== undefined) {
        updates.push(`sample_event_class = $${paramIndex}`);
        params.push(input.sample_event_class);
        paramIndex += 1;
      }

      if (input.expires_at !== undefined) {
        updates.push(`expires_at = $${paramIndex}`);
        params.push(input.expires_at);
        paramIndex += 1;
      }

      if (input.project_scope === "current_project") {
        updates.push(`scope_origin_ids = debugbundle_project_origins($${paramIndex}::uuid)`);
        params.push(input.project_id);
        paramIndex += 1;
      }
      if (input.matcher !== undefined) {
        updates.push(`filter_project_id = $${paramIndex}::uuid`);
        params.push(input.project_id);
        paramIndex += 1;
      }

      if (updates.length === 0) {
        throw new Error("capture_rule_update_empty");
      }

      updates.push("updated_at = NOW()");
      params.push(input.id, input.project_id);

      const result = await db.query<CaptureRuleRow>(
        `
          WITH checked AS MATERIALIZED(SELECT debugbundle_begin_project_rule_write($${paramIndex + 1}::uuid) AS allowed)
          UPDATE capture_rules
          SET ${updates.join(", ")}
          FROM checked WHERE checked.allowed AND id = $${paramIndex} AND project_id=ANY(debugbundle_project_origins($${paramIndex + 1}::uuid))
          RETURNING ${selectColumns(`$${paramIndex + 1}`)}
        `,
        params
      );

      return result.rows[0] === undefined ? null : normalizeCaptureRuleRow(result.rows[0]);
    },

    async deleteCaptureRule(input) {
      const result = await db.query<{ id: string }>(
        `
          WITH checked AS MATERIALIZED(SELECT debugbundle_begin_project_rule_write($2::uuid) AS allowed)
          DELETE FROM capture_rules USING checked
          WHERE checked.allowed AND id = $1 AND project_id=ANY(debugbundle_project_origins($2::uuid))
          RETURNING id
        `,
        [input.id, input.project_id]
      );

      return result.rows.length > 0;
    },

    async recordCaptureRuleMatch(input) {
      await db.query(
        `
          UPDATE capture_rules
          SET hit_count = hit_count + 1,
              last_matched_at = $1::timestamptz,
              updated_at = updated_at
          WHERE id = $2 AND $3::uuid=ANY(COALESCE(scope_origin_ids,ARRAY[project_id]))
            AND debugbundle_canonical_project(project_id)=debugbundle_canonical_project($3::uuid)
        `,
        [input.matched_at, input.id, input.project_id]
      );
    }
  };
}
