import { useEffect, useRef, useState } from "react";
import {
  CreatorCodeSchema,
  type CreatorProgramme
} from "../../../../../packages/referrals/src/programme-policy.js";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { Button } from "../ui/button.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../ui/dialog.js";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { PendingButton } from "./pending-button.js";
import { Skeleton } from "../ui/skeleton.js";

export function CreatorProgrammeManagement({
  creator,
  onSaved,
  onPayments
}: {
  creator: CreatorProgramme;
  onSaved: (creator: CreatorProgramme, shareUrl: string | null) => void;
  onPayments?: (() => void) | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [canReplace, setCanReplace] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);
  const { pending, run } = usePendingAction();
  const openPayments = useRef(false);
  const acceptingReferrals = creator.accepting_new_referrals;
  const branded = creator.code !== creator.legacy_code;
  const checkReplacement = branded && acceptingReferrals;

  useEffect(() => {
    if (!open || !checkReplacement) return;
    let active = true;
    setCanReplace(null);
    setStatusError(false);
    void offerApi.execute("creator_code_status", {}).then(
      (result) => {
        if (active) setCanReplace(result.can_replace);
      },
      () => {
        if (active) setStatusError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [open, checkReplacement, creator.code, statusRetry]);

  const submit = (): void =>
    void run(async () => {
      setError(null);
      const parsed = CreatorCodeSchema.safeParse(code);
      if (!parsed.success) {
        setError(
          parsed.error.issues.some((issue) => issue.message === "reserved_code")
            ? "That code is reserved. Choose another code."
            : "Use 3–24 letters or digits with optional internal hyphens."
        );
        return;
      }
      try {
        const result = await offerApi.execute("code", {
          code: parsed.data,
          ...(branded ? { expected_code: creator.code } : {})
        });
        if (!result.creator) throw new Error("creator_missing");
        onSaved(result.creator, result.share_url);
        setCode("");
        setOpen(false);
      } catch (reason) {
        setError(offerErrorMessage(reason));
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="self-start">
          Manage programme
        </Button>
      </DialogTrigger>
      <DialogContent
        surface="raised"
        onCloseAutoFocus={(event) => {
          if (!openPayments.current) return;
          openPayments.current = false;
          event.preventDefault();
          onPayments?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>Manage {creator.version.name}</DialogTitle>
          <DialogDescription>
            Accepted terms {creator.version.policy.terms_version}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {branded ? (
            <p className="text-sm text-muted-foreground">
              Your original code <code>{creator.legacy_code}</code> remains assigned to you.
            </p>
          ) : null}
          {checkReplacement && statusError ? (
            <Notice tone="warning" title="Code editing status could not be loaded">
              <Button variant="outline" onClick={() => setStatusRetry((attempt) => attempt + 1)}>
                Retry
              </Button>
            </Notice>
          ) : checkReplacement && canReplace === null ? (
            <Skeleton className="h-20 w-full" aria-label="Checking code editing availability" />
          ) : acceptingReferrals && (!branded || canReplace) ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <FieldGroup>
                <Field data-invalid={error !== null} data-disabled={pending}>
                  <FieldLabel htmlFor="branded-creator-code">
                    {branded ? "New creator code" : "Choose your branded code"}
                  </FieldLabel>
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
                    {branded
                      ? "You can replace your code once. Earlier codes and links continue to credit you."
                      : "Choose a memorable code. Your existing referral link will still work."}
                  </FieldDescription>
                  {error ? (
                    <FieldError id="creator-code-error" role="alert">
                      {error}
                    </FieldError>
                  ) : null}
                </Field>
                <PendingButton
                  type="submit"
                  className="self-start"
                  pending={pending}
                  pendingLabel={branded ? "Saving code" : "Reserving code"}
                  disabled={!code.trim() || code.trim().toUpperCase() === creator.code}
                >
                  {branded ? "Save code" : "Reserve code"}
                </PendingButton>
              </FieldGroup>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              {acceptingReferrals
                ? "Contact support for further code corrections."
                : "Code editing is available when your programme can accept new referrals."}
            </p>
          )}
        </div>
        <DialogFooter>
          {onPayments ? (
            <DialogClose asChild>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  openPayments.current = true;
                }}
              >
                Payout settings
              </Button>
            </DialogClose>
          ) : null}
          <DialogClose asChild>
            <Button disabled={pending}>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
