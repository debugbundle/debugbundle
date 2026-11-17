import { useEffect, useRef, useState, useId } from "react";
import type { z } from "zod";
import {
  CreatorPayoutProgrammeSchema,
  PayoutDetailsSchema,
  type PayoutPreferenceSummary
} from "../../../../../packages/referrals/src/payout-preferences.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "../ui/field.js";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup
} from "../ui/select.js";
import { Input } from "../ui/input.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";
import { PendingButton } from "./pending-button.js";
import { LoadErrorCallout } from "./load-error-callout.js";

type Policy = z.output<
  (typeof import("../../../../../packages/referral-client/src/payout-operations.js"))["PAYOUT_OPERATIONS"]["payout_policy"]["response"]
>;
type Programme = z.infer<typeof CreatorPayoutProgrammeSchema>;
const policy = (): Promise<Policy> => offerApi.execute("payout_policy", {});
const currencies = {
  usd: "US dollars",
  eur: "Euros",
  gbp: "British pounds",
  cad: "Canadian dollars",
  aud: "Australian dollars"
};
const methods = { iban: "Bank transfer (IBAN)", wise: "Wise", revolut: "Revolut" };
export function CreatorPayoutPreferences({
  identity,
  onSetupCompleteChange
}: {
  identity: string;
  onSetupCompleteChange?: (complete: boolean) => void;
}): JSX.Element {
  const [data, setData] = useState<{ policy: Policy; programmes: Programme[] } | null>(null),
    [failed, setFailed] = useState(false),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState("");
  const generation = useRef(0),
    id = useId();
  useEffect(() => {
    const current = ++generation.current;
    setData(null);
    setFailed(false);
    void Promise.all([policy(), offerApi.execute("payout_preferences", {})])
      .then(([settings, list]) => {
        if (current !== generation.current) return;
        if (list.user_id !== identity) throw new Error("payout_context_changed");
        setData({ policy: settings, programmes: list.programmes });
        // Keep setup prominent until every accepted programme has a saved destination.
        onSetupCompleteChange?.(
          list.programmes.length > 0 && list.programmes.every((p) => p.preference !== null)
        );
        setSelected((previous) =>
          list.programmes.some((p) => p.programme_id === previous)
            ? previous
            : (list.programmes[0]?.programme_id ?? "")
        );
      })
      .catch(() => {
        if (current === generation.current) {
          setFailed(true);
          onSetupCompleteChange?.(false);
        }
      });
    return () => {
      generation.current++;
    };
  }, [identity, revision, onSetupCompleteChange]);
  if (failed)
    return (
      <LoadErrorCallout
        title="Payout preferences could not be loaded"
        pending={false}
        onRetry={() => setRevision((v) => v + 1)}
      />
    );
  if (!data) return <Skeleton className="h-32 w-full" />;
  if (!data.programmes.length)
    return (
      <Notice>
        Join a referral programme to add payout preferences. You can join and earn before completing
        payment setup.
      </Notice>
    );
  const programme = data.programmes.find((p) => p.programme_id === selected);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payout preferences</CardTitle>
        <CardDescription>
          Choose how you would like to receive this programme’s earnings. You can join and earn
          before completing setup.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.programmes.length > 1 ? (
          <Field>
            <FieldLabel htmlFor={id}>Programme</FieldLabel>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {data.programmes.map((p) => (
                    <SelectItem key={p.programme_id} value={p.programme_id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <p className="text-sm font-medium">{programme?.name}</p>
        )}
        {!data.policy.configured ? (
          <Notice title="Payment setup is temporarily unavailable">
            Your earnings remain recorded. Contact support before your first payout.
          </Notice>
        ) : programme ? (
          <PayoutPreferenceForm
            key={`${identity}:${programme.programme_id}:${programme.preference?.revision ?? "new"}`}
            programme={programme}
            identity={identity}
            policy={data.policy}
            onSaved={() => setRevision((v) => v + 1)}
          />
        ) : null}
        <p className="text-sm text-muted-foreground">
          Payouts are normally reviewed monthly once your available balance reaches US$50. Smaller
          balances carry forward. Contact us to arrange final settlement or another payment
          arrangement.
        </p>
        <p className="text-sm text-muted-foreground">
          Balances are recorded in USD. Your preferred payout currency is subject to agreement and
          an available payment route; transfers are reviewed and made manually.
        </p>
      </CardContent>
    </Card>
  );
}
function PayoutPreferenceForm({
  programme,
  identity,
  policy,
  onSaved
}: {
  programme: Programme;
  identity: string;
  policy: Policy;
  onSaved: () => void;
}): JSX.Element {
  const saved = programme.preference;
  const [editing, setEditing] = useState(!saved),
    [method, setMethod] = useState(saved?.method ?? "iban"),
    [currency, setCurrency] = useState(saved?.currency ?? policy.default_currency),
    [country, setCountry] = useState(saved?.country ?? ""),
    [holder, setHolder] = useState(""),
    [destination, setDestination] = useState(""),
    [error, setError] = useState<string | null>(null),
    [invalidField, setInvalidField] = useState<string | null>(null);
  const { pending, run } = usePendingAction(),
    id = useId();
  const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
  const save = (): void =>
    void run(async () => {
      setError(null);
      setInvalidField(null);
      const details = PayoutDetailsSchema.safeParse({
        method,
        currency,
        country,
        holder,
        destination
      });
      if (!details.success) {
        const issue = details.error.issues[0],
          field = String(issue?.path[0] ?? "");
        setInvalidField(field);
        setError(
          field === "destination"
            ? "Enter a valid IBAN or payment tag without a URL."
            : field === "holder"
              ? "Enter the account holder or recipient name."
              : field === "country"
                ? "Choose a supported country."
                : "Check your payment preferences."
        );
        return;
      }
      try {
        await offerApi.execute("save_payout_preferences", {
          expected_user_id: identity,
          programme_id: programme.programme_id,
          expected_revision: saved?.revision ?? null,
          details: details.data
        });
        setHolder("");
        setDestination("");
        onSaved();
      } catch (reason) {
        setError(offerErrorMessage(reason));
      }
    });
  const field = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    max: number
  ): JSX.Element => (
    <Field>
      <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
      <Input
        id={`${id}-${key}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalidField === key}
        aria-describedby={error ? `${id}-error` : undefined}
        maxLength={max}
        autoComplete="off"
        spellCheck={false}
        disabled={pending}
      />
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      {saved ? (
        <p className="text-sm">
          {methods[saved.method]} · {saved.masked_destination} · {saved.currency.toUpperCase()}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add payment details before your first payout. Format checks do not verify account
          ownership.
        </p>
      )}
      {!editing ? (
        <div>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Update payout preferences
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-method`}>Payment method</FieldLabel>
                <Select
                  value={method}
                  disabled={pending}
                  onValueChange={(value) => {
                    setMethod(value as PayoutPreferenceSummary["method"]);
                    setDestination("");
                  }}
                >
                  <SelectTrigger id={`${id}-method`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {policy.methods.map((value) => (
                        <SelectItem key={value} value={value}>
                          {methods[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-currency`}>Preferred payout currency</FieldLabel>
                <Select
                  value={currency}
                  disabled={pending}
                  onValueChange={(value) =>
                    setCurrency(value as PayoutPreferenceSummary["currency"])
                  }
                >
                  <SelectTrigger id={`${id}-currency`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {policy.currencies.map((value) => (
                        <SelectItem key={value} value={value}>
                          {currencies[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-country`}>Country</FieldLabel>
                <Select value={country} disabled={pending} onValueChange={setCountry}>
                  <SelectTrigger
                    aria-invalid={invalidField === "country"}
                    aria-describedby={error ? `${id}-error` : undefined}
                    id={`${id}-country`}
                  >
                    <SelectValue placeholder="Choose your country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {policy.countries.map((value) => (
                        <SelectItem key={value} value={value}>
                          {countryNames.of(value) ?? value}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {field("holder", "Account holder / recipient name", holder, setHolder, 140)}
            </div>
            {field(
              "destination",
              method === "iban" ? "IBAN" : method === "wise" ? "Wisetag" : "Revtag",
              destination,
              setDestination,
              64
            )}
            <FieldDescription>
              Saved destinations are encrypted and shown masked. Updating these details applies to
              future payouts; already prepared payments retain their recorded instructions.
            </FieldDescription>
            {error ? (
              <FieldError id={`${id}-error`} role="alert">
                {error}
              </FieldError>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <PendingButton type="submit" pending={pending} pendingLabel="Saving preferences">
                Save payout preferences
              </PendingButton>
              {saved ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setEditing(false);
                    setHolder("");
                    setDestination("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
