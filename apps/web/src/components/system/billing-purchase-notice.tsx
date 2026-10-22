import { CalloutCard } from "./callout-card.js";
import { Button } from "../ui/button.js";

/** Shared explanation beside unavailable first-purchase controls. */
export function BillingPurchaseNotice({ unlockDate }: { unlockDate: string | null }): JSX.Element {
  return (
    <CalloutCard
      eyebrow="Paid subscriptions"
      title={
        unlockDate === null
          ? "Paid subscriptions unlock after the first seven days of your trial"
          : `Paid subscriptions unlock on ${unlockDate}`
      }
      description="Need to subscribe sooner?"
      tone="neutral"
      aria-live="polite"
    >
      <div>
        <Button asChild variant="outline">
          <a href="https://debugbundle.com/contact/">Contact us</a>
        </Button>
      </div>
    </CalloutCard>
  );
}
