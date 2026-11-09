import type { DeliverWebhookJob } from "./queue-types.js";
import type {
  DeleteWebhookResult,
  WebhookEventType,
  WebhookFilters,
  WebhookRecord
} from "./types.js";

export interface CreateWebhookDeliveryIntentInput {
  webhook_id: string;
  project_id: string;
  incident_id: string | null;
  event_type: WebhookEventType;
  occurred_at: string;
  target_url: string;
  signing_secret: string;
  payload: Record<string, unknown>;
}

export interface CreateWebhookTestDeliveryInput {
  organization_id: string;
  project_id?: string;
  webhook_id: string;
  event_type: WebhookEventType;
  actor_user_id?: string;
  actor_role?: "owner" | "admin" | "member" | "viewer";
}

export interface CreateWebhookTestDeliveryResult {
  delivery_id: string;
  event_type: WebhookEventType;
}

export type WebhookDeliveryStatus = "pending" | "retrying" | "delivered" | "failed" | "disabled";

export interface MatchingWebhookInput {
  project_id: string;
  event_type: WebhookEventType;
  environment: string;
  service_name: string;
  severity: "low" | "medium" | "high" | "critical";
  bundle_type?: "failure" | "improvement";
  is_verification?: boolean;
}

export interface MatchingWebhook {
  webhook_id: string;
  target_url: string;
  signing_secret: string;
}

export interface WebhookDeliveryIntent {
  delivery_id: string;
  webhook_id: string;
  project_id: string;
  incident_id: string | null;
  event_type: WebhookEventType;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  occurred_at: string;
  target_url: string;
  next_attempt_at: string | null;
  last_response_code: number | null;
  last_attempted_at: string | null;
  last_error: string | null;
  payload: Record<string, unknown>;
  signing_secret: string;
}

export interface MarkWebhookDeliveryAttemptInput {
  delivery_id: string;
  attempt: number;
  delivered: boolean;
  error_message: string | null;
  response_code: number | null;
}

export interface MarkWebhookDeliveryAttemptResult {
  status: "retrying" | "delivered" | "failed";
  next_attempt: number | null;
  webhook_disabled?: boolean;
  webhook_id?: string;
}

export interface WebhookDeliveryStore {
  listWebhooksForOrganization(input: {
    organization_id: string;
    project_id: string;
    limit: number;
  }): Promise<WebhookRecord[] | null>;
  createWebhookForOrganization(input: {
    organization_id: string;
    project_id: string;
    created_by_user_id: string;
    url: string;
    signing_secret: string;
    events: WebhookEventType[];
    filters: WebhookFilters;
    is_enabled: boolean;
  }): Promise<WebhookRecord | null>;
  getWebhookForOrganization(input: {
    organization_id: string;
    project_id?: string;
    webhook_id: string;
  }): Promise<WebhookRecord | null>;
  updateWebhookForOrganization(input: {
    project_scope?: "current_project";
    organization_id: string;
    webhook_id: string;
    project_id?: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member" | "viewer";
    url?: string;
    events?: WebhookEventType[];
    filters?: WebhookFilters;
    is_enabled?: boolean;
  }): Promise<WebhookRecord | null>;
  deleteWebhookForOrganization(input: {
    organization_id: string;
    webhook_id: string;
    project_id?: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member" | "viewer";
  }): Promise<DeleteWebhookResult | null>;
  listMatchingWebhooks(input: MatchingWebhookInput): Promise<MatchingWebhook[]>;
  createDeliveryIntent(input: CreateWebhookDeliveryIntentInput): Promise<{ delivery_id: string }>;
  createTestDeliveryForOrganization(
    input: CreateWebhookTestDeliveryInput
  ): Promise<CreateWebhookTestDeliveryResult | null>;
  getDeliveryIntent(deliveryId: string): Promise<WebhookDeliveryIntent | null>;
  claimDueDeliveries(limit: number): Promise<DeliverWebhookJob[]>;
  markDeliveryAttempt(
    input: MarkWebhookDeliveryAttemptInput
  ): Promise<MarkWebhookDeliveryAttemptResult>;
  listDeliveriesForWebhook(
    webhookId: string,
    limit: number
  ): Promise<
    Array<{
      delivery_id: string;
      event_type: WebhookEventType;
      status: WebhookDeliveryStatus;
      attempt_count: number;
      next_attempt_at: string | null;
      last_response_code: number | null;
      last_attempted_at: string | null;
      last_error: string | null;
    }>
  >;
  listDeliveriesForWebhookInOrganization(input: {
    webhookId: string;
    organizationId: string;
    limit: number;
  }): Promise<{
    deliveries: Array<{
      delivery_id: string;
      event_type: WebhookEventType;
      status: WebhookDeliveryStatus;
      attempt_count: number;
      next_attempt_at: string | null;
      last_response_code: number | null;
      last_attempted_at: string | null;
      last_error: string | null;
    }>;
  } | null>;
  retryDeliveryForOrganization(input: {
    organization_id: string;
    project_id?: string;
    webhook_id: string;
    delivery_id: string;
    actor_user_id?: string;
    actor_role?: "owner" | "admin" | "member" | "viewer";
  }): Promise<{ delivery_id: string; event_type: WebhookEventType } | null>;
}
