import { LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { BrandLockup } from "../components/system/brand-lockup.js";
import { CalloutCard } from "../components/system/callout-card.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader } from "../components/ui/card.js";
import { FieldDescription } from "../components/ui/field.js";
import { acceptProjectInvite } from "../lib/project-sharing-api.js";
import { showErrorToast, showSuccessToast } from "../lib/notify.js";
import { logout } from "../lib/api.js";
import { useSession } from "../lib/session.js";

const TERMS_OF_SERVICE_URL = "https://debugbundle.com/terms";
const PRIVACY_POLICY_URL = "https://debugbundle.com/privacy";

export function ProjectInvitePage(): JSX.Element {
  const { session, setSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const token = searchParams.get("token")?.trim() ?? "";
  const loginHref = `/login?next=${encodeURIComponent(`/invite${location.search}`)}`;

  if (session !== null && errorCode === null && token.length === 0) {
    return <Navigate replace to="/dashboard" />;
  }

  async function handleAcceptInvite(): Promise<void> {
    if (token.length === 0) {
      setErrorCode("invalid_token");
      return;
    }

    setIsSubmitting(true);
    setErrorCode(null);

    try {
      const membership = await acceptProjectInvite(token);
      showSuccessToast("Project invite accepted.");
      void navigate(`/projects/${membership.project_id}`, { replace: true });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "invalid_session") {
          setSession(null);
        }

        setErrorCode(error.message);
      } else {
        setErrorCode("unknown_error");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSwitchAccount(): Promise<void> {
    try {
      await logout();
      setSession(null);
      void navigate(loginHref, { replace: true });
    } catch {
      showErrorToast("Could not sign out.");
    }
  }

  if (session === null) {
    return (
      <InviteShell
        title="Accept project invite"
        description="Sign in with the invited email address to accept this project invite."
      >
        <div className="space-y-5">
          <CalloutCard
            eyebrow="Sign in required"
            title="Sign in to continue"
            description="Use the invited email address, then come back here to accept the invite."
            tone="neutral"
          />
          <Button asChild className="w-full">
            <Link to={loginHref}>Sign in with email</Link>
          </Button>
        </div>
      </InviteShell>
    );
  }

  const errorState = getInviteErrorState(errorCode, session.email);

  return (
    <InviteShell
      title="Accept project invite"
      description="Review this invite and confirm access for the signed-in account."
    >
      <div className="space-y-5">
        <CalloutCard
          eyebrow="Signed in"
          title={errorState?.title ?? "Ready to accept invite"}
          description={errorState?.description ?? `You are signed in as ${session.email}. Accept the invite to open this project.`}
          tone={errorState?.tone ?? "neutral"}
        />

        {errorCode === "invite_email_mismatch" ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => void handleSwitchAccount()}>
            Switch account
          </Button>
        ) : (
          <Button type="button" className="w-full" disabled={isSubmitting || token.length === 0} onClick={() => void handleAcceptInvite()}>
            {isSubmitting ? <LoaderCircleIcon className="animate-spin" /> : null}
            Accept invite
          </Button>
        )}
      </div>
    </InviteShell>
  );
}

function InviteShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-6 text-foreground md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex justify-center">
          <BrandLockup href="/login" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <p className="text-xl font-semibold">{title}</p>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>

        <FieldDescription className="px-6 text-center text-balance">
          By continuing, you agree to our{" "}
          <a href={TERMS_OF_SERVICE_URL} className="underline underline-offset-4 hover:text-foreground" target="_blank" rel="noreferrer">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href={PRIVACY_POLICY_URL} className="underline underline-offset-4 hover:text-foreground" target="_blank" rel="noreferrer">
            Privacy Policy
          </a>.
        </FieldDescription>
      </div>
    </div>
  );
}

function getInviteErrorState(
  errorCode: string | null,
  email: string
): { title: string; description: string; tone: "warning" | "neutral" } | null {
  switch (errorCode) {
    case "invite_email_mismatch":
      return {
        title: "This invite is for a different email address",
        description: `You are signed in as ${email}. Sign in with the invited email address to accept this invite.`,
        tone: "warning"
      };
    case "invalid_token":
      return {
        title: "This invite link is not valid",
        description: "Request a new invite link from the project owner or admin.",
        tone: "warning"
      };
    case "invalid_session":
      return {
        title: "Sign in to continue",
        description: "Your session is no longer active. Sign in again with the invited email address.",
        tone: "warning"
      };
    case "unknown_error":
      return {
        title: "Could not accept invite",
        description: "Try again in a moment.",
        tone: "warning"
      };
    default:
      return null;
  }
}
