import { useState } from "react";
import type {
  ProgrammeVersion,
  OfferPolicy
} from "../../../../../packages/referrals/src/programme-policy.js";
import {
  ProgrammeDraftSchema,
  OfferPercentageInputSchema
} from "../../../../../packages/referrals/src/programme-policy.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { localDateTimeInput, localDateTimeUtc } from "../../lib/local-datetime.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldDescription,
  FieldError,
  FieldSet,
  FieldLegend
} from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import { Checkbox } from "../ui/checkbox.js";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup
} from "../ui/select.js";
import { Button } from "../ui/button.js";
import { PendingButton } from "./pending-button.js";

export function OfferProgrammeEditor({
  source,
  onSaved,
  onCancel
}: {
  source: ProgrammeVersion | null;
  onSaved: (version: ProgrammeVersion) => void;
  onCancel: () => void;
}): JSX.Element {
  const initial = source?.policy;
  const [name, setName] = useState(source?.name ?? "Creator referral programme"),
    [description, setDescription] = useState(
      source?.public_description ??
        "Introductory savings for new DebugBundle customers. Review the programme details for eligible plans and current terms."
    ),
    [kind, setKind] = useState<OfferPolicy["kind"]>(initial?.kind ?? "referral"),
    [discount, setDiscount] = useState(String((initial?.discount_basis_points ?? 2000) / 100)),
    [commission, setCommission] = useState(
      String((initial?.commission_basis_points ?? 5000) / 100)
    ),
    [months, setMonths] = useState(String(initial?.commission_months ?? 12)),
    [originalStart] = useState(initial?.claims_start_at ?? new Date().toISOString()),
    [start, setStart] = useState(() => localDateTimeInput(originalStart)),
    [end, setEnd] = useState(() => localDateTimeInput(initial?.claims_end_at)),
    [redeem, setRedeem] = useState(() => localDateTimeInput(initial?.redeem_by)),
    [cap, setCap] = useState(String(initial?.max_claims ?? 100)),
    [terms, setTerms] = useState(initial?.terms_version ?? "referrals-2026-11"),
    [plans, setPlans] = useState<OfferPolicy["eligible_plans"]>(
      initial?.eligible_plans ?? ["solo", "team", "business"]
    ),
    [intervals, setIntervals] = useState<OfferPolicy["eligible_intervals"]>(
      initial?.eligible_intervals ?? ["month", "year"]
    ),
    [early, setEarly] = useState(initial?.allow_early_purchase_grants ?? true),
    [error, setError] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  const save = (): void =>
    void run(async () => {
      setError(null);
      const parsed = ProgrammeDraftSchema.safeParse({
        name,
        public_description: description,
        policy: {
          kind,
          discount_basis_points: OfferPercentageInputSchema.safeParse(discount).data ?? Number.NaN,
          commission_basis_points:
            kind === "promotion"
              ? 0
              : (OfferPercentageInputSchema.safeParse(commission).data ?? Number.NaN),
          commission_months: Number(months),
          eligible_plans: plans,
          eligible_intervals: intervals,
          claims_start_at: localDateTimeUtc(start, originalStart),
          claims_end_at: end ? (localDateTimeUtc(end, initial?.claims_end_at) ?? end) : null,
          redeem_by: redeem ? (localDateTimeUtc(redeem, initial?.redeem_by) ?? redeem) : null,
          max_claims: cap === "" ? null : Number(cap),
          allow_early_purchase_grants: early,
          terms_version: terms
        }
      });
      if (!parsed.success) {
        setError(
          parsed.error.issues.some((issue) => issue.path[1] === "commission_basis_points")
            ? "Commission must be between 0% and 100% of collected base cash, with up to two decimal places, so the retained amount cannot be negative."
            : "Check percentages, eligible plans and intervals, claim limit and dates. End must follow start; commission months must be between 1 and 12."
        );
        return;
      }
      try {
        const result = await offerApi.execute("draft", {
          ...parsed.data,
          ...(source ? { programme_id: source.programme_id } : {})
        });
        onSaved(result.programme);
      } catch (reason) {
        setError(offerErrorMessage(reason));
      }
    });
  const text = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    description?: string,
    type = "text",
    step?: number
  ): JSX.Element => (
    <Field key={id}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        step={step}
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {source ? `New revision of ${source.name}` : "Create programme draft"}
        </CardTitle>
        <CardDescription>
          Commercial terms are immutable after saving. A new revision affects only newly accepted
          referrals and claims. Saving does not activate the offer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <FieldGroup>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              {text("programme-name", "Name", name, setName)}
              <Field>
                <FieldLabel htmlFor="programme-kind">Programme type</FieldLabel>
                <Select
                  value={kind}
                  disabled={pending}
                  onValueChange={(value) => setKind(value as OfferPolicy["kind"])}
                >
                  <SelectTrigger id="programme-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="referral">Creator referrals</SelectItem>
                      <SelectItem value="promotion">Promotional offer</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor="programme-description">Public description</FieldLabel>
              <Textarea
                id="programme-description"
                value={description}
                maxLength={1000}
                disabled={pending}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <FieldGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {text(
                "programme-discount",
                "Customer discount (%)",
                discount,
                setDiscount,
                undefined,
                "number",
                0.01
              )}
              {kind === "referral"
                ? text(
                    "programme-commission",
                    "Commission (%)",
                    commission,
                    setCommission,
                    "Share of collected base cash after discounts. 100% leaves no base cash before fees and operating costs.",
                    "number",
                    0.01
                  )
                : null}
              {kind === "referral"
                ? text(
                    "programme-months",
                    "Commission months",
                    months,
                    setMonths,
                    undefined,
                    "number"
                  )
                : null}
            </FieldGroup>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <FieldSet>
                <FieldLegend variant="label">Eligible plans</FieldLegend>
                <div className="flex flex-wrap gap-4">
                  {(["solo", "team", "business"] as const).map((plan) => (
                    <Field key={plan} orientation="horizontal">
                      <Checkbox
                        id={`programme-${plan}`}
                        checked={plans.includes(plan)}
                        disabled={pending}
                        onCheckedChange={(checked) =>
                          setPlans((value) =>
                            checked === true
                              ? [...value, plan]
                              : value.filter((item) => item !== plan)
                          )
                        }
                      />
                      <FieldLabel htmlFor={`programme-${plan}`}>
                        {plan[0]!.toUpperCase() + plan.slice(1)}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>
              <FieldSet>
                <FieldLegend variant="label">Eligible intervals</FieldLegend>
                <div className="flex flex-wrap gap-4">
                  {(["month", "year"] as const).map((interval) => (
                    <Field key={interval} orientation="horizontal">
                      <Checkbox
                        id={`programme-${interval}`}
                        checked={intervals.includes(interval)}
                        disabled={pending}
                        onCheckedChange={(checked) =>
                          setIntervals((value) =>
                            checked === true
                              ? [...value, interval]
                              : value.filter((item) => item !== interval)
                          )
                        }
                      />
                      <FieldLabel htmlFor={`programme-${interval}`}>
                        {interval === "year" ? "Yearly" : "Monthly"}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>
            </FieldGroup>
            <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {text(
                "programme-start",
                "Claims start",
                start,
                setStart,
                "Your device’s local time. Saved in UTC.",
                "datetime-local"
              )}
              {text(
                "programme-end",
                "Claims end (optional)",
                end,
                setEnd,
                "Local time. Blank means no closing date.",
                "datetime-local"
              )}
              {text(
                "programme-redeem",
                "Redeem by (optional)",
                redeem,
                setRedeem,
                "Local time. Blank means saved offers do not expire. Campaign claims cover the remaining trial plus seven days.",
                "datetime-local"
              )}
            </FieldGroup>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              {text(
                "programme-cap",
                "Maximum claims",
                cap,
                setCap,
                "Blank means unlimited and requires explicit acknowledgement at activation.",
                "number"
              )}
              {text(
                "programme-terms",
                "Terms version",
                terms,
                setTerms,
                "Must match the published terms reviewed by creators."
              )}
            </FieldGroup>
            <Field orientation="horizontal">
              <Checkbox
                id="programme-early"
                checked={early}
                disabled={pending}
                onCheckedChange={(value) => setEarly(value === true)}
              />
              <FieldLabel htmlFor="programme-early">
                Allow individually approved early-purchase grants
              </FieldLabel>
            </Field>
            {error ? <FieldError role="alert">{error}</FieldError> : null}
            <div className="flex flex-wrap gap-2">
              <PendingButton type="submit" pending={pending} pendingLabel="Saving draft">
                Save draft
              </PendingButton>
              <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
