import type {
  TrialLifecycleBillingStore,
  TrialLifecycleNotificationCandidate
} from "../../../packages/storage/src/billing-store.js";
import type { PostgresOperationalEmailDeliveryStore } from "../../../packages/storage/src/operational-email-delivery-store.js";

export interface ScheduleTrialLifecycleEmailsResult {
  queued_started: number;
  queued_reminders: number;
  expired_trials: number;
  queued_converted: number;
}

function buildTrialStartedPayload(candidate: TrialLifecycleNotificationCandidate): Record<string, unknown> {
  return {
    trial_plan: candidate.trial_plan,
    trial_ends_at: candidate.trial_ends_at
  };
}

function buildTrialReminderPayload(
  candidate: TrialLifecycleNotificationCandidate,
  reminderDays: 1 | 7
): Record<string, unknown> {
  return {
    trial_plan: candidate.trial_plan,
    trial_ends_at: candidate.trial_ends_at,
    days_remaining: reminderDays
  };
}

function buildTrialExpiredPayload(candidate: TrialLifecycleNotificationCandidate, now: string): Record<string, unknown> {
  return {
    trial_plan: candidate.trial_plan,
    trial_ended_at: candidate.trial_expired_at ?? now
  };
}

function buildTrialConvertedPayload(candidate: TrialLifecycleNotificationCandidate): Record<string, unknown> {
  return {
    trial_plan: candidate.trial_plan,
    paid_plan: candidate.current_plan
  };
}

export async function scheduleTrialLifecycleEmails(input: {
  now?: Date;
  batchSize: number;
  billingStore:
    | (Pick<TrialLifecycleBillingStore, keyof TrialLifecycleBillingStore> & {
        expireTrialForOrganization(input: {
          organization_id: string;
          now: string;
        }): Promise<unknown>;
      })
    | Partial<TrialLifecycleBillingStore>;
  operationalEmailDeliveryStore:
    | Pick<PostgresOperationalEmailDeliveryStore, "queueOrganizationOperationalEmailDelivery">
    | Partial<Pick<PostgresOperationalEmailDeliveryStore, "queueOrganizationOperationalEmailDelivery">>;
}): Promise<ScheduleTrialLifecycleEmailsResult> {
  const now = (input.now ?? new Date()).toISOString();
  const queueOrganizationOperationalEmailDelivery =
    input.operationalEmailDeliveryStore.queueOrganizationOperationalEmailDelivery;
  const claimTrialStartedNotificationCandidates =
    input.billingStore.claimTrialStartedNotificationCandidates;
  const claimTrialEndingSoonNotificationCandidates =
    input.billingStore.claimTrialEndingSoonNotificationCandidates;
  const claimExpiredTrialCandidates = input.billingStore.claimExpiredTrialCandidates;
  const claimTrialConvertedNotificationCandidates =
    input.billingStore.claimTrialConvertedNotificationCandidates;
  const recordTrialLifecycleEvent = input.billingStore.recordTrialLifecycleEvent;

  if (
    queueOrganizationOperationalEmailDelivery === undefined ||
    claimTrialStartedNotificationCandidates === undefined ||
    claimTrialEndingSoonNotificationCandidates === undefined ||
    claimExpiredTrialCandidates === undefined ||
    claimTrialConvertedNotificationCandidates === undefined ||
    recordTrialLifecycleEvent === undefined
  ) {
    return {
      queued_started: 0,
      queued_reminders: 0,
      expired_trials: 0,
      queued_converted: 0
    };
  }

  let queuedStarted = 0;
  let queuedReminders = 0;
  let expiredTrials = 0;
  let queuedConverted = 0;

  const started = await claimTrialStartedNotificationCandidates({ limit: input.batchSize });
  for (const candidate of started) {
    const dedupeKey = `trial_started:${candidate.trial_started_at}`;
    const result = await queueOrganizationOperationalEmailDelivery({
      organization_id: candidate.organization_id,
      kind: "trial_started",
      dedupe_key: dedupeKey,
      payload: buildTrialStartedPayload(candidate)
    });
    await recordTrialLifecycleEvent({
      organization_id: candidate.organization_id,
      event_type: "trial_started_email",
      dedupe_key: candidate.trial_started_at
    });
    if (result.created) {
      queuedStarted += 1;
    }
  }

  for (const reminderDays of [7, 1] as const) {
    const due = await claimTrialEndingSoonNotificationCandidates({
      now,
      reminder_days: reminderDays,
      limit: input.batchSize
    });

    for (const candidate of due) {
      const lifecycleDedupeKey = `${candidate.trial_ends_at}:${reminderDays}`;
      const emailDedupeKey = `trial_ending_soon:${candidate.trial_ends_at}:${reminderDays}`;
      const result = await queueOrganizationOperationalEmailDelivery({
        organization_id: candidate.organization_id,
        kind: "trial_ending_soon",
        dedupe_key: emailDedupeKey,
        payload: buildTrialReminderPayload(candidate, reminderDays)
      });
      await recordTrialLifecycleEvent({
        organization_id: candidate.organization_id,
        event_type: reminderDays === 7 ? "trial_ending_soon_7d_email" : "trial_ending_soon_1d_email",
        dedupe_key: lifecycleDedupeKey
      });
      if (result.created) {
        queuedReminders += 1;
      }
    }
  }

  const expired = await claimExpiredTrialCandidates({ now, limit: input.batchSize });
  for (const candidate of expired) {
    if (typeof (input.billingStore as { expireTrialForOrganization?: unknown }).expireTrialForOrganization !== "function") {
      break;
    }

    const expiredResult = await (
      input.billingStore as {
        expireTrialForOrganization(input: {
          organization_id: string;
          now: string;
        }): Promise<unknown>;
      }
    ).expireTrialForOrganization({
      organization_id: candidate.organization_id,
      now
    });

    if (expiredResult === "trial_not_expired" || expiredResult === "billing_not_found") {
      continue;
    }

    expiredTrials += 1;
    const dedupeKey = `trial_expired:${candidate.trial_ends_at}`;
    await queueOrganizationOperationalEmailDelivery({
      organization_id: candidate.organization_id,
      kind: "trial_expired",
      dedupe_key: dedupeKey,
      payload: buildTrialExpiredPayload(candidate, now)
    });
    await recordTrialLifecycleEvent({
      organization_id: candidate.organization_id,
      event_type: "trial_expired",
      dedupe_key: candidate.trial_ends_at
    });
  }

  const converted = await claimTrialConvertedNotificationCandidates({ limit: input.batchSize });
  for (const candidate of converted) {
    if (candidate.current_plan === "free") {
      continue;
    }

    const lifecycleDedupeKey = candidate.trial_converted_at ?? candidate.trial_ends_at;
    const emailDedupeKey = `trial_converted:${lifecycleDedupeKey}`;
    const result = await queueOrganizationOperationalEmailDelivery({
      organization_id: candidate.organization_id,
      kind: "trial_converted",
      dedupe_key: emailDedupeKey,
      payload: buildTrialConvertedPayload(candidate)
    });
    await recordTrialLifecycleEvent({
      organization_id: candidate.organization_id,
      event_type: "trial_converted_email",
      dedupe_key: lifecycleDedupeKey
    });
    if (result.created) {
      queuedConverted += 1;
    }
  }

  return {
    queued_started: queuedStarted,
    queued_reminders: queuedReminders,
    expired_trials: expiredTrials,
    queued_converted: queuedConverted
  };
}
