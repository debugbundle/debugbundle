import { resolveLocalArtifactPath } from "./local-artifact-paths.js";
import { buildBundle } from "../../../packages/bundle-engine/src/index.js";
import {
  associateDiagnosticEvidence,
  type RetainedDiagnosticContext
} from "../../../packages/bundle-engine/src/diagnostic-evidence.js";
import { buildReproduction } from "../../../packages/repro-engine/src/index.js";
import { BundleV1Schema, type BundleV1 } from "../../../packages/shared-types/src/index.js";
import type { BundleBuildContext, BuildBundleJob } from "../../../packages/storage/src/index.js";
import type { LocalIncidentState } from "./local-processing-state.js";

interface LocalArtifactsInput {
  rootDirectory: string;
  incident: LocalIncidentState;
  contexts: RetainedDiagnosticContext[];
  updatedAt: string;
  trigger: BuildBundleJob["trigger"];
  writeFile(path: string, content: string): Promise<void>;
  readFile?(path: string): Promise<string>;
  createdAt?: string;
}
function buildBundleContext(incident: LocalIncidentState): BundleBuildContext {
  return {
    incident_id: incident.incident_id,
    project_id: incident.project_id,
    service_id: incident.service_id,
    service_name: incident.service_name,
    service_runtime: incident.service_runtime,
    service_framework: incident.service_framework,
    environment: incident.environment,
    fingerprint: incident.fingerprint,
    title: incident.title,
    severity: incident.severity,
    first_seen_at: incident.first_seen_at,
    last_seen_at: incident.last_seen_at,
    occurrence_count: incident.occurrence_count,
    source_event_types: [...incident.source_event_types]
  };
}
function localBundle(input: LocalArtifactsInput): BundleV1 {
  const incident = input.incident;
  const bundle = buildBundle({
    job: { trigger: input.trigger },
    incident: buildBundleContext(incident),
    bundleMetadata: {
      generation_number: incident.generation_number,
      created_at: input.createdAt ?? input.updatedAt,
      updated_at: input.updatedAt,
      source_event_id: incident.source_event_id,
      source_occurred_at: incident.source_occurred_at
    },
    sourceEnvelopes: incident.source_events,
    ...(incident.failure_event_ids === undefined
      ? {}
      : { failureEventIds: incident.failure_event_ids }),
    diagnosticContexts: input.contexts.filter(
      (context) => context.event.project_id === incident.project_id
    ),
    probeDataItems: []
  });
  return BundleV1Schema.parse({
    ...bundle,
    sdk: { name: "debugbundle-cli", version: "0.1.0" },
    reproduction: buildReproduction(bundle),
    links: {
      ...bundle.links,
      self: incident.bundle_path,
      reproduction: incident.reproduction_path
    },
    metadata: { ...bundle.metadata, generator_version: "cli-process-local-v1" }
  });
}
export async function writeLocalBundleArtifacts(input: LocalArtifactsInput): Promise<void> {
  const bundlePath = await resolveLocalArtifactPath(
    input.rootDirectory,
    input.incident.bundle_path,
    "bundle"
  );
  const reproductionPath = await resolveLocalArtifactPath(
    input.rootDirectory,
    input.incident.reproduction_path,
    "reproduction"
  );
  let previous: BundleV1 | null = null;
  if (input.readFile) {
    try {
      previous = BundleV1Schema.parse(JSON.parse(await input.readFile(bundlePath)));
    } catch {
      /* First generation or unavailable artifact. */
    }
  }
  const bundle = localBundle({
    ...input,
    ...(previous === null ? {} : { createdAt: previous.metadata.created_at })
  });
  // Replaying unchanged retained inputs preserves their existing artifact and age.
  if (
    previous &&
    JSON.stringify({ ...bundle, metadata: previous.metadata }) === JSON.stringify(previous)
  )
    return;
  await input.writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  await input.writeFile(reproductionPath, `${JSON.stringify(bundle.reproduction, null, 2)}\n`);
}

/** A context-only rebuild changes artifacts, never occurrence history or status. */
export async function rebuildLocalDiagnosticArtifacts(
  input: Omit<LocalArtifactsInput, "trigger"> & { readFile(path: string): Promise<string> }
): Promise<LocalIncidentState> {
  const { incident } = input;
  const bundlePath = await resolveLocalArtifactPath(
    input.rootDirectory,
    incident.bundle_path,
    "bundle"
  );
  await resolveLocalArtifactPath(input.rootDirectory, incident.reproduction_path, "reproduction");
  const primary =
    incident.source_events.find((event) => event.event_id === incident.source_event_id) ?? null;
  const association = associateDiagnosticEvidence({
    failure: primary,
    sources: incident.source_events,
    contexts: input.contexts.filter((context) => context.event.project_id === incident.project_id)
  });
  let previous: BundleV1 | null = null;
  try {
    previous = BundleV1Schema.parse(JSON.parse(await input.readFile(bundlePath)));
  } catch {
    /* Rebuild only from retained evidence. */
  }
  if (
    association.events.length === 0 &&
    previous?.context.recovery === undefined &&
    previous?.context.resource_observations === undefined
  )
    return incident;
  const updated = { ...incident, generation_number: incident.generation_number + 1 };
  const artifactInput = {
    ...input,
    incident: updated,
    trigger: "new_context_type" as const,
    ...(previous === null ? {} : { createdAt: previous.metadata.created_at })
  };
  const candidate = localBundle(artifactInput);
  const evidence = (bundle: BundleV1): string =>
    JSON.stringify([
      bundle.context.evidence,
      bundle.context.recovery,
      bundle.context.resource_observations
    ]);
  if (previous !== null && evidence(candidate) === evidence(previous)) return incident;
  await writeLocalBundleArtifacts(artifactInput);
  return updated;
}
