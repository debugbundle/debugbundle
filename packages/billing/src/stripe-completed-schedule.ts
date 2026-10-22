import type Stripe from "stripe";

const options = { timeout: 8000, maxNetworkRetries: 0 } as const;
const id = (value: string | { id: string } | null): string | undefined =>
  typeof value === "string" ? value : value?.id;
function sameItems(
  subscription: Stripe.Subscription,
  phase: Stripe.SubscriptionSchedule.Phase
): boolean {
  return (
    !subscription.items.has_more &&
    subscription.items.data.length === phase.items.length &&
    subscription.items.data.every((item) =>
      phase.items.some(
        (next) => id(next.price) === item.price.id && (next.quantity ?? 1) === item.quantity
      )
    )
  );
}
/** An already applied final phase has no future changes left to discard. */
export function isCompletedManagedSchedule(
  subscription: Stripe.Subscription,
  schedule: Stripe.SubscriptionSchedule,
  organizationId: string
): boolean {
  if (
    schedule.status !== "active" ||
    schedule.end_behavior !== "release" ||
    !schedule.current_phase ||
    id(schedule.subscription) !== subscription.id ||
    schedule.metadata?.["organization_id"] !== organizationId ||
    !["capacity_reduction", "plan_downgrade"].includes(
      schedule.metadata["debugbundle_change"] ?? ""
    ) ||
    schedule.phases.length < 2
  )
    return false;
  const remaining = schedule.phases.filter(
    (phase) => phase.end_date > schedule.current_phase!.start_date
  );
  return (
    remaining.length === 1 &&
    remaining[0]!.start_date === schedule.current_phase.start_date &&
    remaining[0] === schedule.phases.at(-1) &&
    sameItems(subscription, remaining[0]!)
  );
}
export async function readCompletedManagedSchedule(
  client: Stripe,
  subscription: Stripe.Subscription,
  organizationId: string
): Promise<string | null> {
  if (!subscription.schedule) return null;
  const schedule = await client.subscriptionSchedules.retrieve(
    id(subscription.schedule)!,
    {},
    options
  );
  return isCompletedManagedSchedule(subscription, schedule, organizationId) ? schedule.id : null;
}
// This only runs inside an already prepared, owner-requested mutation. Release
// preserves the applied subscription and its payment/settings; it never cancels.
export async function releaseCompletedManagedSchedule(input: {
  client: Stripe;
  subscription: Stripe.Subscription;
  organizationId: string;
  scheduleId: string;
  idempotencyKey: string;
  allowWrite?: boolean;
}): Promise<boolean> {
  const schedule = await input.client.subscriptionSchedules.retrieve(input.scheduleId, {}, options);
  if (schedule.status === "released" && schedule.released_subscription === input.subscription.id)
    return true;
  if (input.allowWrite === false) return false;
  if (
    !isCompletedManagedSchedule(input.subscription, schedule, input.organizationId) ||
    id(input.subscription.schedule) !== schedule.id
  )
    return false;
  const released = await input.client.subscriptionSchedules.release(
    schedule.id,
    {},
    { ...options, idempotencyKey: input.idempotencyKey }
  );
  return released.status === "released" && released.released_subscription === input.subscription.id;
}
