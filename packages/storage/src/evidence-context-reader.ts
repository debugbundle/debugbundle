import type { Queryable } from "./types.js";
import type { EvidenceContextCandidateReference } from "./bundle-types.js";

export function createEvidenceContextReader(db: Queryable): {
  listEvidenceContextCandidates(input: {
    project_id: string;
    service_name: string;
    environment: string;
    failure_event_ids: string[];
  }): Promise<EvidenceContextCandidateReference[]>;
} {
  return {
    async listEvidenceContextCandidates(input) {
      if (input.failure_event_ids.length === 0) return [];
      const result = await db.query<EvidenceContextCandidateReference & Record<string, unknown>>(
        `
      SELECT DISTINCT c.event_id, c.occurred_at::text AS occurred_at, c.received_at::text AS received_at, receipt.payload_hash
      FROM evidence_context_events f JOIN evidence_context_events c
        ON c.project_id=f.project_id AND c.service_name=f.service_name AND c.environment=f.environment
        AND c.failure_hash=f.failure_hash AND c.scope_kind=f.scope_kind AND c.scope_hash=f.scope_hash
      LEFT JOIN evidence_ingestion_receipts receipt ON receipt.project_id=c.project_id AND receipt.event_id=c.event_id
      WHERE f.project_id=$1 AND f.service_name=$2 AND f.environment=$3 AND f.event_id=ANY($4::uuid[])
        AND f.kind='failure' AND c.kind<>'failure' AND f.is_retained=true AND c.is_retained=true AND f.expires_at>now() AND c.expires_at>now()
        AND c.occurred_at BETWEEN f.occurred_at AND f.occurred_at + interval '5 minutes'
        AND ((f.scope_kind='page' AND c.session_hash=f.session_hash) OR
             (f.scope_kind='operation' AND c.trace_hash IS NOT DISTINCT FROM f.trace_hash))
        AND NOT EXISTS (SELECT 1 FROM evidence_context_events other WHERE other.project_id=f.project_id AND other.service_name=f.service_name
          AND other.environment=f.environment AND other.failure_hash=f.failure_hash AND other.scope_kind=f.scope_kind AND other.scope_hash=f.scope_hash
          AND other.kind='failure' AND other.event_id<>f.event_id AND other.expires_at>now())
      ORDER BY occurred_at,event_id LIMIT 200`,
        [
          input.project_id,
          input.service_name,
          input.environment,
          input.failure_event_ids.slice(0, 50)
        ]
      );
      return result.rows;
    }
  };
}
