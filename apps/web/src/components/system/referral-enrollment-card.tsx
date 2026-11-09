import { useEffect, useState } from "react";
import { Checkbox } from "../ui/checkbox.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldLabel, FieldError } from "../ui/field.js";
import { PendingButton } from "./pending-button.js";

export function ReferralEnrollmentCard({
  termsVersion,
  pending,
  error,
  onJoin
}: {
  termsVersion: string;
  pending: boolean;
  error: string | null;
  onJoin: (version: string) => void;
}): JSX.Element {
  const [accepted, setAccepted] = useState(false);
  useEffect(() => setAccepted(false), [termsVersion]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Refer a Business customer</CardTitle>
        <CardDescription>You can join on any plan, including Free.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            Your eligible new customer gets 10% off their first eligible Business base invoice.
          </li>
          <li>
            You earn 50% of eligible collected Business base cash for their first 12 calendar
            months.
          </li>
          <li>
            Capacity, tax, Solo/Team payments, zero bills and year-two service do not earn
            commission. Refunds and disputes adjust earnings.
          </li>
          <li>
            Payments are manual, after at least 30 days and payment clearing. Payout details are
            agreed when needed.
          </li>
        </ul>
        <Field orientation="horizontal">
          <Checkbox
            id="referral-terms"
            checked={accepted}
            disabled={pending}
            onCheckedChange={(value) => setAccepted(value === true)}
          />
          <FieldLabel htmlFor="referral-terms">
            <span>
              I accept the{" "}
              <a
                className="text-primary underline underline-offset-4"
                href="https://debugbundle.com/terms/#referrals"
                target="_blank"
                rel="noreferrer"
              >
                referral programme terms
              </a>
            </span>
          </FieldLabel>
        </Field>
        {error ? <FieldError role="alert">{error}</FieldError> : null}
        <PendingButton
          pending={pending}
          pendingLabel="Joining"
          disabled={!accepted}
          onClick={() => onJoin(termsVersion)}
        >
          Join referral programme
        </PendingButton>
      </CardContent>
    </Card>
  );
}
