import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/system/auth-layout.js";
import { PendingButton } from "../components/system/pending-button.js";
import { Button } from "../components/ui/button.js";
import { Checkbox } from "../components/ui/checkbox.js";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "../components/ui/field.js";
import { logout } from "../lib/api.js";
import { organizationApi } from "../lib/organization-api.js";
import { useSession } from "../lib/session.js";
import { usePendingAction } from "../lib/use-pending-action.js";

export function OrganizationAcceptPage(): JSX.Element {
  const { session, refreshSession, setSession } = useSession();
  const location = useLocation(),
    navigate = useNavigate();
  const [params] = useSearchParams();
  const kind = params.get("kind"),
    token = params.get("token") ?? "";
  const valid =
    (kind === "invite" || kind === "ownership_transfer") &&
    token.length >= 20 &&
    token.length <= 200;
  const transfer = kind === "ownership_transfer";
  const [confirmed, setConfirmed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = usePendingAction();
  const loginHref = `/login?next=${encodeURIComponent(`/organizations/accept${location.search}`)}`;
  return (
    <AuthLayout
      title={transfer ? "Accept organisation ownership" : "Accept organisation invitation"}
      description={
        transfer
          ? "Review the responsibility before accepting this ownership request."
          : "Sign in with the invited email address and choose whether to accept."
      }
    >
      <FieldGroup>
        {!valid ? (
          <FieldError>
            This link is invalid. Ask the organisation Owner for a fresh link.
          </FieldError>
        ) : session === null ? (
          <Button asChild>
            <Link to={loginHref}>Sign in to continue</Link>
          </Button>
        ) : (
          <>
            <FieldDescription>Signed in as {session.email}.</FieldDescription>
            {session.email_verified_at === null ? (
              <FieldError>Verify this email by signing in again before accepting.</FieldError>
            ) : null}
            {transfer ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="accept-ownership-responsibility"
                  checked={confirmed}
                  disabled={pending || accepted}
                  onCheckedChange={(value) => setConfirmed(value === true)}
                />
                <FieldLabel htmlFor="accept-ownership-responsibility">
                  I accept responsibility for billing, people and every project in the organisation
                  named in the email.
                </FieldLabel>
              </Field>
            ) : null}
            <PendingButton
              pending={pending}
              pendingLabel="Accepting…"
              disabled={accepted || session.email_verified_at === null || (transfer && !confirmed)}
              onClick={() =>
                void run(async () => {
                  setError(null);
                  let organizationId: string;
                  try {
                    const result = await organizationApi.accept(
                      transfer ? "ownership_transfer" : "invite",
                      token
                    );
                    organizationId = result.organization_id;
                    setAccepted(true);
                  } catch {
                    setError(
                      "Could not accept this link. Use the original invited email address, or ask the Owner for a fresh link if it expired or was cancelled."
                    );
                    return;
                  }
                  try {
                    await organizationApi.switch(organizationId);
                    const next = await refreshSession();
                    if (next?.organization_id !== organizationId)
                      throw new Error("workspace_not_refreshed");
                    void navigate(transfer ? "/settings/people" : "/projects", { replace: true });
                  } catch {
                    setError(
                      "Acceptance succeeded. Sign in again to open the organisation; do not accept the link again."
                    );
                  }
                })
              }
            >
              {transfer ? "Accept ownership" : "Accept invitation"}
            </PendingButton>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  try {
                    await logout();
                    setSession(null);
                    void navigate(loginHref, { replace: true });
                  } catch {
                    setError("Could not sign out. Please try again.");
                  }
                })
              }
            >
              {accepted ? "Sign in again" : "Use another account"}
            </Button>
          </>
        )}
        {error === null ? null : <FieldError>{error}</FieldError>}
      </FieldGroup>
    </AuthLayout>
  );
}
