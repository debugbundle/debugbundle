import {
  renderAlertDigestEmail,
  renderAlertEmail,
  renderCapacityQuantityChangeEmail,
  renderEmailAuthCodeEmail,
  renderProjectInviteEmail,
  renderWeeklyReportEmail
} from "./index.js";
import {
  renderAllowanceLimitReachedEmail,
  renderAllowanceWarning80Email,
  renderRetentionRotationNoticeEmail,
  renderWebhookAutoDisabledEmail
} from "./operational-emails.js";
import {
  renderTrialConvertedEmail,
  renderTrialEndingSoonEmail,
  renderTrialExpiredEmail,
  renderTrialStartedEmail,
  renderEntitlementDowngradeConfirmationEmail,
  renderEntitlementDowngradeWarningEmail,
  renderPaymentFailureEmail,
  renderPaymentFailureReminderEmail,
  renderPlanChangeConfirmationEmail,
  renderPurchaseConfirmationEmail,
  renderRenewalSuccessEmail
} from "./billing-emails.js";

export interface RenderedSystemEmailPreview {
  subject: string;
  text: string;
  html: string;
}

export interface SystemEmailReviewEntry {
  id: string;
  title: string;
  category: "auth" | "billing" | "operational" | "alerts";
  recipient: string;
  trigger: string;
  requiredInV1: boolean;
  implementationStatus: "implemented" | "missing";
  notes?: string;
  preview?: RenderedSystemEmailPreview;
}

const SAMPLE_PORTAL_URL = "https://app.debugbundle.local/billing";
const SAMPLE_INCIDENT_URL = "https://app.debugbundle.local/incidents/inc_123";
const SAMPLE_BUNDLE_URL = "https://app.debugbundle.local/incidents/inc_123/bundle";
const SAMPLE_EMAIL_BRAND_MARK_URL = "https://app.debugbundle.local/email/debugbundle-mark.png";

export const SYSTEM_EMAIL_REVIEW_ENTRIES: readonly SystemEmailReviewEntry[] = [
  {
    id: "email-sign-in-code",
    title: "Email sign-in code",
    category: "auth",
    recipient: "Signing-in user",
    trigger: "Browser email-code request for signup or login",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderEmailAuthCodeEmail({
        code: "481902",
        appUrl: "https://app.debugbundle.local/login",
        expiresInMinutes: 15,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "project-invite",
    title: "Project invite",
    category: "auth",
    recipient: "Invited email address",
    trigger: "Project invite created successfully",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderProjectInviteEmail({
        acceptUrl: "https://app.debugbundle.local/invite?token=dbundle_invite_preview_123",
        inviterName: "Owen Example",
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "trial-started",
    title: "No-card trial started",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "A free organization successfully starts a 30-day no-card Solo or Team trial",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderTrialStartedEmail({
        organizationName: "Acme Production",
        trialPlan: "team",
        trialEndsAt: "2026-06-30",
        billingUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "trial-ending-soon-7-day",
    title: "No-card trial ending soon (7-day reminder)",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Worker-owned lifecycle scheduling reaches the 7-day reminder window before trial expiry",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderTrialEndingSoonEmail({
        organizationName: "Acme Production",
        trialPlan: "team",
        trialEndsAt: "2026-06-30",
        daysRemaining: 7,
        billingUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "trial-ending-soon-1-day",
    title: "No-card trial ending soon (1-day reminder)",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Worker-owned lifecycle scheduling reaches the 1-day reminder window before trial expiry",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderTrialEndingSoonEmail({
        organizationName: "Acme Production",
        trialPlan: "team",
        trialEndsAt: "2026-06-30",
        daysRemaining: 1,
        billingUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "trial-expired",
    title: "No-card trial expired",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Worker-owned lifecycle expiry downgrades an unconverted no-card trial back to Free",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderTrialExpiredEmail({
        organizationName: "Acme Production",
        trialPlan: "team",
        trialEndedAt: "2026-06-30",
        billingUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "trial-converted",
    title: "No-card trial converted",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "A prior no-card trial receives paid Stripe-backed entitlements",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderTrialConvertedEmail({
        organizationName: "Acme Production",
        trialPlan: "team",
        paidPlan: "team",
        billingUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "purchase-confirmation",
    title: "Purchase confirmation",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "First successful paid checkout or extra-capacity purchase confirmation",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderPurchaseConfirmationEmail({
        organizationName: "Acme Production",
        plan: "team",
        extraCapacity: 4,
        portalUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "renewal-success",
    title: "Renewal success",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Recurring invoice paid for an active subscription",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderRenewalSuccessEmail({
        organizationName: "Acme Production",
        plan: "team",
        extraCapacity: 4,
        nextRenewalDate: "2026-06-01",
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "payment-failure",
    title: "Payment failure",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Recurring invoice payment failure",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderPaymentFailureEmail({
        organizationName: "Acme Production",
        plan: "team",
        portalUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "payment-failure-reminder",
    title: "Payment failure reminder",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Payment remains unresolved after initial failure",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderPaymentFailureReminderEmail({
        organizationName: "Acme Production",
        plan: "team",
        portalUrl: SAMPLE_PORTAL_URL,
        daysUntilDowngrade: 5,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "entitlement-downgrade-warning",
    title: "Entitlement downgrade warning",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "System is about to remove paid capacity after unresolved billing failure or cancellation",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderEntitlementDowngradeWarningEmail({
        organizationName: "Acme Production",
        currentPlan: "team",
        currentCapacityUnits: 10,
        effectiveDate: "2026-06-08",
        portalUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "entitlement-downgrade-confirmation",
    title: "Entitlement downgrade confirmation",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Paid capacity units or plan entitlements were actually reduced",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderEntitlementDowngradeConfirmationEmail({
        organizationName: "Acme Production",
        previousPlan: "team",
        previousCapacityUnits: 10,
        newCapacityUnits: 1,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "plan-change-confirmation",
    title: "Plan change confirmation",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Plan changed between free, solo, or team",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderPlanChangeConfirmationEmail({
        organizationName: "Acme Production",
        previousPlan: "solo",
        newPlan: "team",
        extraCapacity: 4,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "extra-capacity-quantity-change-confirmation",
    title: "Extra capacity quantity change confirmation",
    category: "billing",
    recipient: "Organization owner billing contact",
    trigger: "Extra capacity-unit quantity changed",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderCapacityQuantityChangeEmail({
        organizationName: "Acme Production",
        plan: "team",
        previousCapacity: 2,
        newCapacity: 4,
        totalCapacityUnits: 10,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "webhook-auto-disabled",
    title: "Webhook auto-disabled",
    category: "operational",
    recipient: "Project or organization owner",
    trigger: "Webhook auto-disabled after repeated delivery failures",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderWebhookAutoDisabledEmail({
        organizationName: "Acme Production",
        projectName: "Checkout API",
        webhookId: "wh_01hrf91h0v8g6sz8g4ng1q7nq8",
        targetUrl: "https://hooks.example.test/debugbundle",
        webhooksUrl: "https://app.debugbundle.local/projects/proj_checkout/webhooks",
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "allowance-warning-80",
    title: "Allowance warning 80%",
    category: "operational",
    recipient: "Organization owner",
    trigger: "Allowance usage reaches 80% for a tracked meter",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderAllowanceWarning80Email({
        organizationName: "Acme Production",
        projectName: "Checkout API",
        meterLabel: "Raw ingested events",
        used: 8400,
        limit: 10500,
        currentBehavior: "new ingestion requests are rejected until the usage window resets",
        usageWindowEndsAt: "2026-06-01T00:00:00.000Z",
        billingUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "allowance-limit-reached-100",
    title: "Allowance limit reached 100%",
    category: "operational",
    recipient: "Organization owner",
    trigger: "Allowance usage reaches 100% for a tracked meter",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderAllowanceLimitReachedEmail({
        organizationName: "Acme Production",
        projectName: "Checkout API",
        meterLabel: "Lifecycle webhook deliveries",
        used: 750,
        limit: 750,
        currentBehavior: "new lifecycle webhook deliveries and synthetic test deliveries are suppressed until the usage window resets",
        usageWindowEndsAt: "2026-06-01T00:00:00.000Z",
        billingUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "retention-rotation-notice",
    title: "Retention rotation notice",
    category: "operational",
    recipient: "Organization owner",
    trigger: "Oldest retained bundles are rotated out because retention cap is exceeded",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderRetentionRotationNoticeEmail({
        organizationName: "Acme Production",
        projectName: "Checkout API",
        rotatedOwnerCount: 3,
        retainedBundleLimit: 450,
        billingUrl: SAMPLE_PORTAL_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "weekly-report",
    title: "Weekly report",
    category: "operational",
    recipient: "Configured report channel recipient",
    trigger: "Scheduled weekly-report delivery",
    requiredInV1: true,
    implementationStatus: "implemented",
    get preview() {
      return renderWeeklyReportEmail({
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL,
        windowStart: "2026-05-11T00:00:00.000Z",
        windowEnd: "2026-05-18T00:00:00.000Z",
        projects: [
          {
            projectId: "proj_checkout",
            projectName: "Checkout API",
            bundleCounts: {
              failure: 6,
              improvement: 2
            },
            newIncidents: 3,
            resolvedIncidents: 5,
            openedIncidentsResolved: 3,
            regressions: 1,
            topSpikingIncidents: [
              {
                incident_id: "inc_123",
                title: "Checkout API returned 500",
                occurrence_count: 24,
                spike_detected_at: "2026-05-15T09:17:00.000Z"
              },
              {
                incident_id: "inc_456",
                title: "Worker timeout during bundle generation",
                occurrence_count: 8,
                spike_detected_at: "2026-05-16T14:02:00.000Z"
              }
            ]
          },
          {
            projectId: "proj_web",
            projectName: "Marketing site",
            bundleCounts: {
              failure: 1,
              improvement: 1
            },
            newIncidents: 4,
            resolvedIncidents: 2,
            openedIncidentsResolved: 2,
            regressions: 0,
            topSpikingIncidents: []
          }
        ]
      });
    }
  },
  {
    id: "alert-email",
    title: "Alert delivery email",
    category: "alerts",
    recipient: "Configured alert recipient",
    trigger: "A user-created alert rule matches an incident lifecycle event",
    requiredInV1: false,
    implementationStatus: "implemented",
    notes: "User-configured alert channel, not a fixed system lifecycle email.",
    get preview() {
      return renderAlertEmail({
        conditionType: "new_incident",
        incidentId: "inc_123",
        occurredAt: "2026-05-18T09:12:00.000Z",
        serviceName: "checkout-api",
        environment: "production",
        severity: "high",
        incidentUrl: SAMPLE_INCIDENT_URL,
        bundleUrl: SAMPLE_BUNDLE_URL,
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL
      });
    }
  },
  {
    id: "alert-digest-email",
    title: "Alert digest email",
    category: "alerts",
    recipient: "Configured alert recipient",
    trigger: "Multiple matched alert emails are batched into a per-project, per-recipient digest",
    requiredInV1: false,
    implementationStatus: "implemented",
    notes: "User-configured alert channel, not a fixed system lifecycle email.",
    get preview() {
      return renderAlertDigestEmail({
        brandMarkUrl: SAMPLE_EMAIL_BRAND_MARK_URL,
        alerts: [
          {
            conditionType: "new_incident",
            incidentId: "inc_123",
            occurredAt: "2026-05-18T09:12:00.000Z",
            serviceName: "checkout-api",
            environment: "production",
            severity: "high",
            incidentUrl: SAMPLE_INCIDENT_URL,
            bundleUrl: SAMPLE_BUNDLE_URL,
            summary: "Checkout API returned 500 for payment capture."
          },
          {
            conditionType: "error_spike",
            incidentId: "inc_456",
            occurredAt: "2026-05-18T09:19:00.000Z",
            serviceName: "bundle-worker",
            environment: "production",
            severity: "critical",
            incidentUrl: "https://app.debugbundle.local/incidents/inc_456",
            bundleUrl: "https://app.debugbundle.local/incidents/inc_456/bundle",
            summary: "Bundle worker timeouts spiked after deploy."
          }
        ]
      });
    }
  }
] as const;

export function getSystemEmailReviewEntry(id: string): SystemEmailReviewEntry | null {
  return SYSTEM_EMAIL_REVIEW_ENTRIES.find((entry) => entry.id === id) ?? null;
}
