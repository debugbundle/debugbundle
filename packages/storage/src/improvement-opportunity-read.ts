import { projectActorAllowedSql } from "./project-read-scope.js";
import type { Queryable } from "./types.js";
import { appendProjectReadScope, appendServiceDefinitionFilter } from "./project-read-scope.js";
import type { ImprovementOpportunityStore } from "./improvement-opportunity-types.js";
import {
  buildEffectiveImprovementStatusSql,
  buildImprovementSelectClause,
  type ImprovementRetrievalRow
} from "./improvement-opportunity-shared.js";

export function createImprovementOpportunityRead(
  db: Queryable
): Pick<
  ImprovementOpportunityStore,
  "listImprovementsForOrganization" | "getImprovementForOrganization"
> {
  return {
    async listImprovementsForOrganization(input) {
      const parameters: unknown[] = [input.organization_id, input.user_id ?? null];
      const predicates = [
        `(
          (
            $2::uuid IS NULL
            AND p.organization_id = $1::uuid
          )
          OR (
            $2::uuid IS NOT NULL
            AND (
              ${projectActorAllowedSql("p.id", "$2::uuid", input)}
            )
          )
        )`,
        `(
          io.status <> 'open'
          OR io.kind = 'post_deploy_regression'
          OR (
            io.kind = 'recurring_incident'
            AND COALESCE(
              CASE
                WHEN COALESCE(io.evidence->>'incident_occurrence_count', '') ~ '^[0-9]+$'
                  THEN (io.evidence->>'incident_occurrence_count')::int
              END,
              io.occurrence_count
            )
              >= COALESCE(
                CASE
                  WHEN COALESCE(io.evidence->>'threshold', '') ~ '^[0-9]+$'
                    THEN (io.evidence->>'threshold')::int
                END,
                1
              )
          )
          OR io.bundle_generation_number > 0
          OR io.bundle_failure_reason IS NOT NULL
        )`,
        `NOT (
          io.kind = 'request_failure_pattern'
          AND COALESCE(io.evidence->>'response_status', '') ~ '^[0-9]+$'
          AND (io.evidence->>'response_status')::int = 404
          AND upper(COALESCE(io.evidence->>'http_method', '')) = 'GET'
          AND (
            lower(regexp_replace(COALESCE(io.evidence->>'route_template', ''), '/+$', '')) IN (
              '/.env',
              '/__debug__/render_panel',
              '/actuator',
              '/autodiscover/autodiscover.json',
              '/containers/json',
              '/cpanel',
              '/favicon.ico',
              '/geoserver/web',
              '/logon/logonpoint/index.html',
              '/owa/auth/logon.aspx',
              '/robots.txt',
              '/rdweb/pages',
              '/web',
              '/webclient/login.xhtml',
              '/webconsole',
              '/webui',
              '/whm',
              '/wp-admin',
              '/wp-login.php',
              '/wsman',
              '/xmlrpc.php'
            )
            OR lower(COALESCE(io.evidence->>'route_template', '')) LIKE '/owa/%'
            OR lower(COALESCE(io.evidence->>'route_template', '')) LIKE '/rdweb/%'
            OR lower(COALESCE(io.evidence->>'route_template', '')) LIKE '/vpn/%'
            OR lower(COALESCE(io.evidence->>'route_template', '')) LIKE '/wp-%'
          )
        )`
      ];

      const projectParameter = appendProjectReadScope(
        parameters,
        predicates,
        input,
        "io.project_id"
      );
      if (input.environment !== undefined) {
        parameters.push(input.environment);
        predicates.push(`io.environment = $${parameters.length}`);
      }
      appendServiceDefinitionFilter(
        parameters,
        predicates,
        input,
        projectParameter,
        "io.service_name"
      );
      if (input.status !== undefined) {
        parameters.push(input.status);
        predicates.push(`${buildEffectiveImprovementStatusSql()} = $${parameters.length}`);
      }
      if (input.severity !== undefined) {
        parameters.push(input.severity);
        predicates.push(`io.severity = $${parameters.length}`);
      }
      if (input.kind !== undefined) {
        parameters.push(input.kind);
        predicates.push(`io.kind = $${parameters.length}`);
      }
      if (input.cursor !== undefined) {
        parameters.push(input.cursor.last_detected_at, input.cursor.improvement_id);
        predicates.push(
          `(io.last_detected_at, io.id) < ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`
        );
      }

      parameters.push(input.limit);

      const result = await db.query<ImprovementRetrievalRow>(
        `
          SELECT
            ${buildImprovementSelectClause(projectParameter)}
          FROM improvement_opportunities io
          JOIN projects p ON p.id = debugbundle_canonical_project(io.project_id)
          LEFT JOIN services s ON s.id = io.service_id
          LEFT JOIN service_definitions sd ON sd.id=s.service_definition_id
          WHERE ${predicates.join("\n            AND ")}
          ORDER BY io.last_detected_at DESC, io.id DESC
          LIMIT $${parameters.length}
        `,
        parameters
      );

      return result.rows;
    },

    async getImprovementForOrganization(input) {
      const parameters: unknown[] = [
        input.organization_id,
        input.improvement_id,
        input.user_id ?? null
      ];
      const predicates: string[] = [];
      const projectParameter = appendProjectReadScope(
        parameters,
        predicates,
        input,
        "io.project_id"
      );
      const result = await db.query<ImprovementRetrievalRow>(
        `
          SELECT
            ${buildImprovementSelectClause(projectParameter)}
          FROM improvement_opportunities io
          JOIN projects p ON p.id = debugbundle_canonical_project(io.project_id)
          LEFT JOIN services s ON s.id = io.service_id
          LEFT JOIN service_definitions sd ON sd.id=s.service_definition_id
          WHERE io.id = $2::uuid
            AND (
              (
                $3::uuid IS NULL
                AND p.organization_id = $1::uuid
              )
              OR (
                $3::uuid IS NOT NULL
                AND (
                  ${projectActorAllowedSql("p.id", "$3::uuid", input)}
                )
              )
            )
            ${predicates.map((predicate) => `AND ${predicate}`).join("\n")}
          LIMIT 1
        `,
        parameters
      );

      return result.rows[0] ?? null;
    }
  };
}
