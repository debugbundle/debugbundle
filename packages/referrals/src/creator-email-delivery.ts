import { renderCreatorReferralEmail } from "../../email/src/creator-referral-emails.js";
import {
  ReportEmailTransportError,
  type ReportEmailTransport
} from "../../email/src/ses-transport.js";
import type { createCreatorEmailStore } from "../../storage/src/creator-email-store.js";

/** Sending has a committed fence. Known rejection may retry; ambiguous provider
 * acceptance or a lost DB acknowledgement never triggers an automatic resend. */
export async function deliverCreatorEmail(input: {
  store: ReturnType<typeof createCreatorEmailStore>;
  transport: ReportEmailTransport;
  appBaseUrl: string;
  publicBaseUrl: string;
  brandMarkUrl?: string;
}): Promise<{
  processed: boolean;
  attention?: { delivery_id: string; state: "rejected" | "uncertain" };
}> {
  const claim = await input.store.claim();
  if (!claim) return { processed: false };
  let message: ReturnType<typeof renderCreatorReferralEmail>;
  try {
    message = renderCreatorReferralEmail(claim.payload, input);
  } catch {
    // The send fence still records explicit rejection with no external request.
    const recipient = await input.store.start(claim);
    if (recipient) await input.store.finish(claim, { state: "rejected" });
    return { processed: true };
  }
  const recipient = await input.store.start(claim);
  if (!recipient) return { processed: true };
  let result: { provider_message_id: string | null };
  try {
    result = await input.transport.send({ to: [recipient], ...message });
  } catch (error) {
    const state =
      error instanceof ReportEmailTransportError && error.state === "rejected"
        ? "rejected"
        : "uncertain";
    await input.store.finish(claim, { state });
    return { processed: true, attention: { delivery_id: claim.id, state } };
  }
  // A persistence failure after acceptance leaves 'sending'; its expiry becomes
  // uncertain. Never catch this as a provider rejection and send a second copy.
  await input.store.finish(claim, {
    state: "sent",
    provider_message_id: result.provider_message_id
  });
  return { processed: true };
}
