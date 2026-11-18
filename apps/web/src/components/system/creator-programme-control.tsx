import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreatorProgramme,
  OfferDefinitionSchema
} from "../../../../../packages/referrals/src/programme-policy.js";
import type { z } from "zod";
import { CreatorCodeSchema } from "../../../../../packages/referrals/src/programme-policy.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { ReferralProgrammeCard } from "./referral-programme-card.js";
import { Badge } from "../ui/badge.js";
import { ReadOnlyCopyInput } from "./read-only-copy-input.js";
import { PendingButton } from "./pending-button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldLabel, FieldGroup, FieldDescription, FieldError } from "../ui/field.js";
import { Checkbox } from "../ui/checkbox.js";
import { Input } from "../ui/input.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";

export function CreatorProgrammeControl({
  identity,
  onJoined
}: {
  identity: string;
  onJoined?: () => void;
}): JSX.Element {
  const [creator, setCreator] = useState<CreatorProgramme | null>(null),
    [programmes, setProgrammes] = useState<z.infer<typeof OfferDefinitionSchema>[]>([]),
    [share, setShare] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(false),
    [error, setError] = useState<string | null>(null),
    [code, setCode] = useState(""),
    [accepted, setAccepted] = useState<string | null>(null);
  const generation = useRef(0),
    { pending, run } = usePendingAction();
  const load = useCallback(() => {
    const current = ++generation.current;
    setLoading(true);
    setLoadError(false);
    void Promise.all([
      offerApi.execute("creator", {}),
      offerApi.execute("programmes", { limit: 100 })
    ])
      .then(([profile, list]) => {
        if (current !== generation.current) return;
        setCreator(profile.creator);
        setShare(profile.share_url);
        // The public projection intentionally omits mutable operator state. Joining
        // always checks availability and the exact accepted terms again on the server.
        setProgrammes(list.programmes.filter((item) => item.policy.kind === "referral"));
      })
      .catch(() => {
        if (current === generation.current) setLoadError(true);
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    setCreator(null);
    setAccepted(null);
    setCode("");
    setError(null);
    load();
    return () => {
      generation.current++;
    };
  }, [identity, load]);
  const join = (version: z.infer<typeof OfferDefinitionSchema>): void =>
    void run(async () => {
      const current = generation.current;
      setError(null);
      try {
        const result = await offerApi.execute("join", {
          version_id: version.version_id,
          terms_version: version.policy.terms_version
        });
        if (current !== generation.current) return;
        setCreator(result.creator);
        setShare(result.share_url);
        setAccepted(null);
        onJoined?.();
      } catch (reason) {
        if (current === generation.current) setError(offerErrorMessage(reason));
      }
    });
  const reserve = (): void =>
    void run(async () => {
      const current = generation.current;
      setError(null);
      const parsed = CreatorCodeSchema.safeParse(code);
      if (!parsed.success) {
        setError(
          "Use 3–24 letters or digits with optional internal hyphens. Official and generated codes are reserved."
        );
        return;
      }
      try {
        const result = await offerApi.execute("code", { code: parsed.data });
        if (current !== generation.current) return;
        setCreator(result.creator);
        setShare(result.share_url);
        setCode("");
      } catch (reason) {
        if (current === generation.current) setError(offerErrorMessage(reason));
      }
    });
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (loadError)
    return (
      <Notice tone="warning" title="Creator programme could not be loaded">
        <Button variant="outline" onClick={load}>
          Retry programme
        </Button>
      </Notice>
    );
  const current = creator?.version,
    choices = programmes.filter((version) => version.version_id !== current?.version_id);
  return (
    <div className="flex flex-col gap-6">
      {creator ? (
        <Card>
          <CardHeader>
            <CardTitle>Your creator code</CardTitle>
            <CardDescription>
              Share your code directly or use your referral link. Neither grants access to a
              customer workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!creator.accepting_new_referrals ||
            !programmes.some((version) => version.version_id === creator.version.version_id) ? (
              <Notice title="New referrals are unavailable">
                Saved customer offers and your earnings keep their accepted terms. Review any
                available programme below before promoting a new offer, or contact support about an
                unavailable code.
              </Notice>
            ) : null}
            <ReadOnlyCopyInput id="creator-code" label="Referral code" value={creator.code} />
            <ReadOnlyCopyInput id="creator-link" label="Referral link" value={share ?? ""} />
            {creator.code === creator.legacy_code ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  reserve();
                }}
              >
                <FieldGroup>
                  <Field data-invalid={error !== null} data-disabled={pending}>
                    <FieldLabel htmlFor="branded-creator-code">Choose your branded code</FieldLabel>
                    <Input
                      id="branded-creator-code"
                      value={code}
                      maxLength={24}
                      disabled={pending}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      aria-invalid={error !== null}
                      aria-describedby={
                        error ? "creator-code-help creator-code-error" : "creator-code-help"
                      }
                      onChange={(event) => setCode(event.target.value)}
                    />
                    <FieldDescription id="creator-code-help">
                      You can reserve one code. Later corrections go through support, and old
                      aliases stay linked to you.
                    </FieldDescription>
                  </Field>
                  <PendingButton
                    type="submit"
                    pending={pending}
                    pendingLabel="Reserving code"
                    disabled={!code.trim()}
                  >
                    Reserve code
                  </PendingButton>
                </FieldGroup>
              </form>
            ) : null}
            {error ? (
              <FieldError id="creator-code-error" role="alert">
                {error}
              </FieldError>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Your legacy code {creator.legacy_code} remains assigned to you; availability follows
              your active agreement.
            </p>
          </CardContent>
        </Card>
      ) : null}
      {!creator && !choices.length ? (
        <Notice title="New enrolment is paused">
          No referral programme is accepting enrolment right now. Existing earnings remain
          available.
        </Notice>
      ) : null}
      <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
        {current ? (
          <ReferralProgrammeCard key={current.version_id} programme={current}>
            <Badge variant="secondary" className="self-start">
              Your current programme
            </Badge>
            <p className="text-sm text-muted-foreground">
              Accepted terms {current.policy.terms_version}. Existing customer agreements and earned
              balances keep their original policy.
            </p>
          </ReferralProgrammeCard>
        ) : null}
        {choices.map((version) => (
          <ReferralProgrammeCard key={version.version_id} programme={version}>
            <Field orientation="horizontal">
              <Checkbox
                id={`creator-terms-${version.version_id}`}
                checked={accepted === version.version_id}
                disabled={pending}
                onCheckedChange={(value) => setAccepted(value === true ? version.version_id : null)}
              />
              <FieldLabel htmlFor={`creator-terms-${version.version_id}`}>
                <span className="break-words">
                  I accept this programme's terms {version.policy.terms_version}.{" "}
                  {creator
                    ? "This changes new referrals only; existing customer agreements keep their terms."
                    : ""}
                </span>
              </FieldLabel>
            </Field>
            {error ? <FieldError role="alert">{error}</FieldError> : null}
            <PendingButton
              className="h-auto min-h-8 max-w-full self-start whitespace-normal text-left"
              pending={pending}
              pendingLabel="Joining"
              disabled={accepted !== version.version_id}
              onClick={() => join(version)}
            >
              {creator ? "Use this programme for new referrals" : "Join referral programme"}
            </PendingButton>
          </ReferralProgrammeCard>
        ))}
      </div>
    </div>
  );
}
