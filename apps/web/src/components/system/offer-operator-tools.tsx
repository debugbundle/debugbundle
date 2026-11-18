import { useState } from "react";
import { offerApi, offerErrorMessage } from "../../lib/offer-api.js";
import { issueOfferDelegation, revokeOfferDelegation } from "../../lib/offer-operator-api.js";
import type { OfferOperatorAction } from "../../../../../packages/referrals/src/offer-operator-contracts.js";
import { usePendingAction } from "../../lib/use-pending-action.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldLabel, FieldGroup, FieldError, FieldDescription } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Checkbox } from "../ui/checkbox.js";
import { Notice } from "../ui/notice.js";
import { Button } from "../ui/button.js";
import { PendingButton } from "./pending-button.js";
import { ReadOnlyCopyInput } from "./read-only-copy-input.js";

/** Reusable bounded operator form; domain operations still use the shared client. */
function OperatorActionForm({
  title,
  description,
  fields,
  submitLabel,
  onSubmit
}: {
  title: string;
  description: string;
  fields: { key: string; label: string; hint?: string }[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<string>;
}): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({}),
    [error, setError] = useState<string | null>(null),
    [result, setResult] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const { pending, run } = usePendingAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmed) return;
            void run(async () => {
              setError(null);
              setResult(null);
              try {
                setResult(await onSubmit(values));
                setConfirmed(false);
              } catch (reason) {
                setError(offerErrorMessage(reason));
              }
            });
          }}
        >
          <FieldGroup>
            {fields.map((field) => (
              <Field key={field.key}>
                <FieldLabel htmlFor={`operator-${field.key}`}>{field.label}</FieldLabel>
                <Input
                  id={`operator-${field.key}`}
                  value={values[field.key] ?? ""}
                  maxLength={field.key.includes("reason") ? 300 : 255}
                  required
                  disabled={pending}
                  onChange={(event) => {
                    setValues((previous) => ({ ...previous, [field.key]: event.target.value }));
                    setConfirmed(false);
                  }}
                />
                {field.hint ? <FieldDescription>{field.hint}</FieldDescription> : null}
              </Field>
            ))}
            <Field orientation="horizontal">
              <Checkbox
                id={`confirm-${fields[0]!.key}`}
                checked={confirmed}
                disabled={pending}
                onCheckedChange={(value) => setConfirmed(value === true)}
              />
              <FieldLabel htmlFor={`confirm-${fields[0]!.key}`}>
                I checked the target and confirm this action.
              </FieldLabel>
            </Field>
            {error ? <FieldError role="alert">{error}</FieldError> : null}
            {result ? <Notice>{result}</Notice> : null}
            <PendingButton
              type="submit"
              pending={pending}
              pendingLabel="Saving"
              disabled={!confirmed}
            >
              {submitLabel}
            </PendingButton>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
export function OfferOperatorTools(): JSX.Element {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <OperatorActionForm
        title="Correct a creator code"
        description="Keep existing aliases with the same creator. Codes are never transferred or recycled."
        fields={[
          { key: "correction_partner", label: "Partner ID" },
          { key: "correction_code", label: "New public code" },
          { key: "correction_reason", label: "Reason" }
        ]}
        submitLabel="Correct creator code"
        onSubmit={async (v) => {
          await offerApi.execute("correct_code", {
            partner_id: v["correction_partner"],
            code: v["correction_code"],
            reason: v["correction_reason"]
          });
          return "Creator code corrected; previous aliases are retained.";
        }}
      />
      <OperatorActionForm
        title="Approve early purchase"
        description="A public code alone does not bypass seven days. Grant only to a verified, eligible saved claim; maximum seven-day grant lifetime."
        fields={[
          { key: "grant_claim", label: "Claim ID" },
          {
            key: "grant_expiry",
            label: "Expires at (UTC)",
            hint: "ISO timestamp within the next seven days."
          },
          { key: "grant_reason", label: "Reason" }
        ]}
        submitLabel="Approve early purchase"
        onSubmit={async (v) => {
          const result = await offerApi.execute("early_grant", {
            claim_id: v["grant_claim"],
            expires_at: v["grant_expiry"],
            reason: v["grant_reason"]
          });
          return `Grant ${result.grant_id} expires ${result.expires_at}.`;
        }}
      />
      <OperatorActionForm
        title="Revoke early purchase"
        description="Stops new admission. An already admitted ambiguous checkout must still reconcile safely."
        fields={[{ key: "revoke_grant", label: "Grant ID" }]}
        submitLabel="Revoke grant"
        onSubmit={async (v) => {
          await offerApi.execute("revoke_grant", { grant_id: v["revoke_grant"] });
          return "Grant revoked.";
        }}
      />
      <OperatorActionForm
        title="Revoke an unused offer"
        description="Use for fraud or an explicit support correction. Consumed financial records are preserved."
        fields={[
          { key: "revoke_claim", label: "Claim ID" },
          { key: "revoke_reason", label: "Reason" }
        ]}
        submitLabel="Revoke unused offer"
        onSubmit={async (v) => {
          await offerApi.execute("revoke_claim", {
            claim_id: v["revoke_claim"],
            reason: v["revoke_reason"]
          });
          return "Unused offer revoked; financial history retained.";
        }}
      />
      <OperatorActionForm
        title="Block a public code"
        description="Stops new claims using this alias. Saved offers and code ownership remain recorded."
        fields={[
          { key: "block_code", label: "Code to block" },
          { key: "block_reason", label: "Reason" }
        ]}
        submitLabel="Block code"
        onSubmit={async (v) => {
          await offerApi.execute("block_code", {
            code: v["block_code"],
            blocked: true,
            reason: v["block_reason"]
          });
          return "Code blocked for new claims.";
        }}
      />
      <OperatorActionForm
        title="Unblock a public code"
        description="Restores use only when its original programme and creator are eligible. Ownership stays the same."
        fields={[
          { key: "unblock_code", label: "Code to unblock" },
          { key: "unblock_reason", label: "Reason" }
        ]}
        submitLabel="Unblock code"
        onSubmit={async (v) => {
          await offerApi.execute("block_code", {
            code: v["unblock_code"],
            blocked: false,
            reason: v["unblock_reason"]
          });
          return "Code unblocked.";
        }}
      />
      <OfferDelegationControl />
    </div>
  );
}
function OfferDelegationControl(): JSX.Element {
  const [tokenId, setTokenId] = useState(""),
    [actions, setActions] = useState<OfferOperatorAction[]>(["read"]),
    [proof, setProof] = useState<{ proof: string; expires_at: string } | null>(null),
    [error, setError] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Temporary CLI or MCP access</CardTitle>
        <CardDescription>
          Explicitly delegate programme actions for 15 minutes to one of your unrestricted member
          tokens. This grants no Analytics or payout authority.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              setError(null);
              try {
                setProof(await issueOfferDelegation(tokenId, actions));
              } catch (reason) {
                setError(offerErrorMessage(reason));
              }
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="delegated-member-token">Member token ID</FieldLabel>
              <Input
                id="delegated-member-token"
                value={tokenId}
                required
                disabled={pending || proof !== null}
                onChange={(event) => setTokenId(event.target.value)}
              />
              <FieldDescription>
                Enter its ID, never the secret token. The token must belong to this signed-in
                account and selected workspace.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Allowed actions</FieldLabel>
              {(["read", "manage", "activate", "grant"] as const).map((action) => (
                <Field key={action} orientation="horizontal">
                  <Checkbox
                    id={`delegate-${action}`}
                    checked={actions.includes(action)}
                    disabled={pending || proof !== null}
                    onCheckedChange={(value) =>
                      setActions((previous) =>
                        value === true
                          ? [...previous, action]
                          : previous.filter((item) => item !== action)
                      )
                    }
                  />
                  <FieldLabel htmlFor={`delegate-${action}`}>
                    {action === "read"
                      ? "Read programmes"
                      : action === "manage"
                        ? "Manage drafts, codes and revocations"
                        : action === "activate"
                          ? "Activate, schedule, pause or end programmes"
                          : "Manage early-purchase grants"}
                  </FieldLabel>
                </Field>
              ))}
            </Field>
            {proof ? (
              <>
                <Notice title="Temporary authorisation issued">
                  Expires {new Date(proof.expires_at).toLocaleString()}. Copy it now into a private
                  file (permissions 0600) for the CLI, or supply it as operatorAuthorization to MCP.
                  It is not saved in browser storage.
                </Notice>
                <ReadOnlyCopyInput
                  id="operator-proof"
                  label="Temporary authorisation"
                  value={proof.proof}
                />
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      setError(null);
                      try {
                        await revokeOfferDelegation(proof.proof);
                        setProof(null);
                      } catch (reason) {
                        setError(offerErrorMessage(reason));
                      }
                    })
                  }
                >
                  Revoke this authorisation
                </Button>
              </>
            ) : (
              <PendingButton
                type="submit"
                pending={pending}
                pendingLabel="Issuing authorisation"
                disabled={!tokenId || !actions.length}
              >
                Issue temporary authorisation
              </PendingButton>
            )}
            {error ? <FieldError role="alert">{error}</FieldError> : null}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
