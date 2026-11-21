import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreatorProgramme,
  OfferDefinitionSchema
} from "../../../../../packages/referrals/src/programme-policy.js";
import type { z } from "zod";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { ReferralProgrammeCard } from "./referral-programme-card.js";
import { Badge } from "../ui/badge.js";
import { ReadOnlyCopyInput } from "./read-only-copy-input.js";
import { PendingButton } from "./pending-button.js";
import { Field, FieldLabel, FieldError } from "../ui/field.js";
import { Checkbox } from "../ui/checkbox.js";
import { CreatorProgrammeManagement } from "./creator-programme-management.js";
import { showSuccessToast } from "../../lib/notify.js";
import { Button } from "../ui/button.js";
import { Notice } from "../ui/notice.js";
import { Skeleton } from "../ui/skeleton.js";

export function CreatorProgrammeControl({
  identity,
  onJoined,
  onPayments
}: {
  identity: string;
  onJoined?: () => void;
  onPayments?: () => void;
}): JSX.Element {
  const [creator, setCreator] = useState<CreatorProgramme | null>(null),
    [programmes, setProgrammes] = useState<z.infer<typeof OfferDefinitionSchema>[]>([]),
    [share, setShare] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(false),
    [error, setError] = useState<string | null>(null),
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
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (loadError)
    return (
      <Notice tone="warning" title="Creator programme could not be loaded">
        <Button variant="outline" onClick={load}>
          Retry programme
        </Button>
      </Notice>
    );
  const profileGeneration = generation.current;
  const current = creator?.version,
    choices = programmes.filter((version) => version.version_id !== current?.version_id);
  return (
    <div className="flex flex-col gap-6">
      {!creator && !choices.length ? (
        <Notice title="New enrolment is paused">
          No referral programme is accepting enrolment right now. Existing earnings remain
          available.
        </Notice>
      ) : null}
      <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
        {creator && current ? (
          <ReferralProgrammeCard
            key={current.version_id}
            programme={current}
            badge={
              <Badge variant={creator.accepting_new_referrals ? "success" : "secondary"}>
                {creator.accepting_new_referrals ? "Active" : "New referrals unavailable"}
              </Badge>
            }
          >
            {creator.accepting_new_referrals ? null : (
              <Notice>Saved customer offers and earnings keep their accepted terms.</Notice>
            )}
            <ReadOnlyCopyInput
              id="creator-code"
              label="Referral code"
              copyLabel="Copy referral code"
              value={creator.code}
            />
            <ReadOnlyCopyInput
              id="creator-link"
              label="Referral link"
              copyLabel="Copy referral link"
              value={share ?? ""}
            />
            <CreatorProgrammeManagement
              creator={creator}
              onPayments={onPayments}
              onSaved={(updated, shareUrl) => {
                if (profileGeneration !== generation.current) return;
                setCreator(updated);
                setShare(shareUrl);
                showSuccessToast("Creator code saved.");
              }}
            />
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
