import {
  parseStoredEvent,
  validateEventAtAdmission
} from "../../../packages/event-normalizer/src/index.js";
import { isObjectMissing } from "../../../packages/storage/src/object-store-errors.js";
import { buildRawEventObjectKey } from "../../../packages/storage/src/index.js";
import { hashEvidencePayload } from "../../../packages/storage/src/evidence-ingestion-receipt.js";
import type { EventEnvelope } from "../../../packages/shared-types/src/index.js";
import type { BuildBundleWorkerDependencies } from "./processor-shared.js";

export interface RetainedDiagnosticContext {
  event: EventEnvelope;
  received_at: string;
}

export async function collectDiagnosticContext(input: {
  dependencies: BuildBundleWorkerDependencies;
  projectId: string;
  service: string;
  environment: string;
  failures: EventEnvelope[];
}): Promise<RetainedDiagnosticContext[]> {
  const store = input.dependencies.incidentStore;
  if (!store.listEvidenceContextCandidates || !input.dependencies.objectStore.getObject) return [];
  const candidates = await store.listEvidenceContextCandidates({
    project_id: input.projectId,
    service_name: input.service,
    environment: input.environment,
    failure_event_ids: input.failures.map((event) => event.event_id)
  });
  const result: RetainedDiagnosticContext[] = [];
  for (const candidate of candidates.slice(0, 200)) {
    try {
      const raw = await input.dependencies.objectStore.getObject({
        key: buildRawEventObjectKey({
          projectId: input.projectId,
          occurredAt: new Date(candidate.occurred_at),
          eventId: candidate.event_id
        })
      });
      const event = parseStoredEvent(raw);
      const receipt = new Date(candidate.received_at).toISOString();
      if (
        event?.event_type !== "diagnostic_context" ||
        event.event_id !== candidate.event_id ||
        Date.parse(event.occurred_at) !== Date.parse(candidate.occurred_at) ||
        !validateEventAtAdmission(event, receipt).success ||
        event.service.name !== input.service ||
        event.service.environment !== input.environment
      )
        continue;
      // Custom/legacy adapters can lack receipts. Where ingestion supplied an
      // identity hash, overwritten raw bytes must not become recovery evidence.
      if (candidate.payload_hash != null && hashEvidencePayload(event) !== candidate.payload_hash)
        continue;
      result.push({ event, received_at: receipt });
    } catch (error) {
      if (!isObjectMissing(error)) throw error;
    }
  }
  return result;
}
