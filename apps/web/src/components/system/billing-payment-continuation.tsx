import { Button } from "../ui/button.js";

/** Keep Billing available while a saved Stripe invoice is paid or authenticated. */
export function BillingPaymentContinuation(props: {
  url: string;
  onContinue: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Opens in a new tab. Return here after payment; billing refreshes automatically.
      </p>
      <Button asChild>
        <a href={props.url} target="_blank" rel="noopener noreferrer" onClick={props.onContinue}>
          Continue payment on Stripe<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </Button>
    </div>
  );
}
