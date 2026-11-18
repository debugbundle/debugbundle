import { useState } from "react";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { PendingButton } from "./pending-button.js";
import { ReadOnlyCopyInput } from "./read-only-copy-input.js";
import { Notice } from "../ui/notice.js";
type Instructions = import("zod").z.output<
  (typeof import("../../../../../packages/referral-client/src/payout-operations.js"))["PAYOUT_OPERATIONS"]["payout_instructions"]["response"]
>;
const read = (batchId: string): Promise<Instructions> =>
  offerApi.execute("payout_instructions", { batch_id: batchId });
/** Full destinations are fetched only by explicit operator action; the parent
 * keys this component by batch so switching payments clears revealed details. */
export function PayoutInstructionDetails({ batchId }: { batchId: string }): JSX.Element {
  const [result, setResult] = useState<Instructions | null>(null),
    [error, setError] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  const reveal = (): void =>
    void run(async () => {
      setError(null);
      try {
        setResult(await read(batchId));
      } catch (reason) {
        setError(offerErrorMessage(reason));
      }
    });
  return (
    <div className="flex flex-col gap-3">
      {!result ? (
        <div>
          <PendingButton
            type="button"
            variant="outline"
            pending={pending}
            pendingLabel="Loading instructions"
            onClick={reveal}
          >
            Show payment instructions
          </PendingButton>
        </div>
      ) : result.instructions ? (
        <>
          <p className="text-sm font-medium">
            Frozen payment preferences · {result.instructions.details.method.toUpperCase()} ·{" "}
            {result.instructions.details.currency.toUpperCase()} ·{" "}
            {result.instructions.details.country}
          </p>
          <ReadOnlyCopyInput
            id={`payout-holder-${batchId}`}
            label="Account holder / recipient name"
            value={result.instructions.details.holder}
          />
          <ReadOnlyCopyInput
            id={`payout-destination-${batchId}`}
            label={result.instructions.details.method === "iban" ? "IBAN" : "Payment tag"}
            value={result.instructions.details.destination}
          />
          <p className="text-sm text-muted-foreground">
            The balance is in USD. Confirm the recipient, settlement currency, amount and any
            conversion before sending manually. Later preference edits do not change these
            instructions.
          </p>
        </>
      ) : (
        <Notice>Legacy payment: use the recipient details agreed outside the product.</Notice>
      )}
      {error ? <Notice tone="warning">{error}</Notice> : null}
    </div>
  );
}
