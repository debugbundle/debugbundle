import type { EventEnvelope, BrowserResourceRoutes } from "../../shared-types/src/index.js";
import type { BuildBundleJob } from "./queue-types.js";

export type RetainedBundleOwnerReference =
  | {
      owner_type: "incident";
      project_id: string;
      incident_id: string;
      improvement_opportunity_id: null;
    }
  | {
      owner_type: "improvement";
      project_id: string;
      incident_id: null;
      improvement_opportunity_id: string;
    };

export interface BundleBuildContext {
  incident_id: string;
  project_id: string;
  service_id: string | null;
  service_name: string;
  service_runtime: string | null;
  service_framework: string | null;
  environment: string;
  fingerprint: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  source_event_types: EventEnvelope["event_type"][];
  resource_routes?: BrowserResourceRoutes;
}

export interface IncidentEventReference {
  event_id: string;
  event_type: EventEnvelope["event_type"];
  occurred_at: string;
}

export interface ProbeEventCandidateReference {
  event_id: string;
  occurred_at: string;
}

export interface LogEventCandidateReference {
  event_id: string;
  occurred_at: string;
}

export interface BundleBuildContextStore {
  getDeploymentForServiceAt?(input: {
    project_id: string;
    service_id: string;
    environment: string;
    occurred_at: string;
  }): Promise<{
    commit_sha: string;
    deploy_version: string;
    branch: string;
    deployed_at: string;
  } | null>;
  getBundleBuildContext(input: {
    project_id: string;
    incident_id: string;
  }): Promise<BundleBuildContext | null>;
  hasBundleGenerationForSourceEvent?(input: {
    incident_id: string;
    event_id: string;
  }): Promise<boolean>;
  markBundleGenerationFailure?(input: {
    incident_id: string;
    reason: string | null;
  }): Promise<void>;
  pruneRetainedBundleOwnersForProject?(input: {
    project_id: string;
    retained_bundle_limit: number;
  }): Promise<RetainedBundleOwnerReference[]>;
  reserveBundleGeneration(input: {
    incident_id: string;
    event_id: string;
    occurred_at: string;
    trigger: BuildBundleJob["trigger"];
  }): Promise<{
    generation_number: number;
    created_at: string;
    updated_at: string;
    source_event_id: string;
    source_occurred_at: string;
    trigger: BuildBundleJob["trigger"];
  }>;
  listIncidentEventReferences(input: { incident_id: string }): Promise<IncidentEventReference[]>;
  listProbeEventCandidatesForServiceWindow(input: {
    project_id: string;
    service_name: string;
    environment: string;
    window_start: string;
    window_end: string;
  }): Promise<ProbeEventCandidateReference[]>;
  listLogEventCandidatesForServiceWindow(input: {
    project_id: string;
    service_name: string;
    environment: string;
    window_start: string;
    window_end: string;
  }): Promise<LogEventCandidateReference[]>;
}
