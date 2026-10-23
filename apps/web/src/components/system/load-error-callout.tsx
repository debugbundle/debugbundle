import { CalloutCard } from "./callout-card.js";
import { PendingButton } from "./pending-button.js";

export function LoadErrorCallout({
  title,
  pending,
  onRetry
}: {
  title: string;
  pending: boolean;
  onRetry: () => void;
}): JSX.Element {
  return (
    <CalloutCard
      eyebrow="Connection"
      title={title}
      description="Check your connection and try again."
      tone="warning"
      role="alert"
    >
      <div>
        <PendingButton pending={pending} pendingLabel="Retrying" onClick={onRetry}>
          Retry
        </PendingButton>
      </div>
    </CalloutCard>
  );
}
