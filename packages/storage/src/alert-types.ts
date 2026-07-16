import type {
  AlertSeverityLifecycleEvent,
  AlertSeverityLifecycleScope
} from "./alert-lifecycle.js";
import type { DeliverAlertEmailDigestJob } from "./queue-types.js";
import type { EventClass, EventEnvelope } from "../../shared-types/src/index.js";

export type AlertChannel = "email" | "slack" | "discord" | "webhook";

export type AlertConditionType =
  | "new_incident"
  | "incident_regressed"
  | "error_spike"
  | "severity_threshold"
  | "regression_after_deploy";

export interface AlertRuleRecord extends Record<string, unknown> {
  alert_id: string;
  project_id: string;
  created_by_user_id: string;
  service_id: string | null;
  channel: AlertChannel;
  condition_type: AlertConditionType;
  severity_min: "low" | "medium" | "high" | "critical" | null;
  severity_lifecycle_scope: AlertSeverityLifecycleScope | null;
  cooldown_seconds: number;
  config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeleteAlertResult {
  alert_id: string;
}

export interface AlertManagementStore {
  listAlertsForOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<AlertRuleRecord[] | null>;
  createAlertForOrganization(input: {
    organization_id: string;
    project_id: string;
    created_by_user_id: string;
    service_id?: string | null;
    channel: AlertChannel;
    condition_type: AlertConditionType;
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    severity_lifecycle_scope?: AlertSeverityLifecycleScope | null;
    cooldown_seconds: number;
    config: Record<string, unknown>;
    is_enabled: boolean;
  }): Promise<AlertRuleRecord | null>;
  updateAlertForOrganization(input: {
    organization_id: string;
    alert_id: string;
    project_id?: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
    service_id?: string | null;
    channel?: AlertChannel;
    condition_type?: AlertConditionType;
    severity_min?: "low" | "medium" | "high" | "critical" | null;
    severity_lifecycle_scope?: AlertSeverityLifecycleScope | null;
    cooldown_seconds?: number;
    config?: Record<string, unknown>;
    is_enabled?: boolean;
  }): Promise<AlertRuleRecord | null>;
  deleteAlertForOrganization(input: {
    organization_id: string;
    project_id?: string;
    alert_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member";
  }): Promise<DeleteAlertResult | null>;
}

export interface DemotedIncidentEventReference {
  event_id: string;
  occurred_at: string;
}

export interface RecordIncidentEventRetentionInput {
  incident_id: string;
  event_id: string;
  event_type: EventEnvelope["event_type"];
  event_class?: EventClass;
  occurred_at: string;
  occurrence_count: number;
  severity: "low" | "medium" | "high" | "critical";
  level?: string | null;
}

export interface RecordIncidentEventRetentionResult {
  is_sampled: boolean;
  demoted_event_references: DemotedIncidentEventReference[];
}

export interface AlertDeliveryRecord extends Record<string, unknown> {
  delivery_id: string;
  alert_id: string;
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  notification_key: string;
  channel: AlertChannel;
  status: "pending" | "delivered" | "failed";
  payload: Record<string, unknown>;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertEmailDigestRecord extends Record<string, unknown> {
  digest_id: string;
  project_id: string;
  recipient: string;
  status: "pending" | "delivered" | "failed";
  next_attempt_at: string | null;
  claimed_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertEmailDigestItemRecord extends Record<string, unknown> {
  item_id: string;
  digest_id: string;
  alert_id: string;
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  notification_key: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CreateAlertDeliveryIntentInput {
  alert_id: string;
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  notification_key: string;
  cooldown_seconds: number;
  channel: AlertChannel;
  payload: Record<string, unknown>;
}

export interface MarkAlertDeliveryResultInput {
  delivery_id: string;
  delivered: boolean;
  error_message: string | null;
}

export interface QueueAlertEmailDigestItemInput {
  alert_id: string;
  project_id: string;
  incident_id: string;
  condition_type: AlertConditionType;
  dedupe_key: string;
  notification_key: string;
  cooldown_seconds: number;
  recipient: string;
  payload: Record<string, unknown>;
  aggregation_window_seconds: number;
  allow_new_digest: boolean;
}

export interface AlertDeliveryStore {
  listMatchingAlerts(input: {
    project_id: string;
    condition_type: AlertConditionType;
    service_name: string;
    environment: string;
    severity: "low" | "medium" | "high" | "critical";
    lifecycle_event?: AlertSeverityLifecycleEvent;
  }): Promise<AlertRuleRecord[]>;
  createAlertDeliveryIntent(input: CreateAlertDeliveryIntentInput): Promise<{ delivery_id: string | null; created: boolean }>;
  markAlertDeliveryResult(input: MarkAlertDeliveryResultInput): Promise<{ status: "delivered" | "failed" }>;
  queueAlertEmailDigestItem(input: QueueAlertEmailDigestItemInput): Promise<{
    digest_id: string | null;
    created: boolean;
    created_digest: boolean;
  }>;
  claimDueAlertEmailDigests(limit: number): Promise<DeliverAlertEmailDigestJob[]>;
  getAlertEmailDigest(digestId: string): Promise<{
    digest: AlertEmailDigestRecord;
    items: AlertEmailDigestItemRecord[];
  } | null>;
  markAlertEmailDigestResult(input: {
    digest_id: string;
    delivered: boolean;
    error_message: string | null;
  }): Promise<{ status: "delivered" | "failed" }>;
}
