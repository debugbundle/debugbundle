import { useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { requestEmailCode, verifyEmailCode } from "../../lib/api.js";
import { showSuccessToast } from "../../lib/notify.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Field, FieldLabel, FieldDescription } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { Button } from "../ui/button.js";
export function OperatorEmailGate(input: {
  resourceLabel?: string;
  email: string;
  onVerified: (session: Awaited<ReturnType<typeof verifyEmailCode>>) => void;
}): JSX.Element {
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSendCode(): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await requestEmailCode({
        email: input.email,
        accepted_terms: true
      });
      setStep("verify");
      setCode("");
      showSuccessToast("Sign-in code sent successfully.");
    } catch {
      setErrorMessage("We could not send a sign-in code right now. Try again in a moment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(): Promise<void> {
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage("Enter the six-digit code from your email.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const nextSession = await verifyEmailCode({
        email: input.email,
        code
      });
      input.onVerified(nextSession);
      showSuccessToast("Signed in successfully.");
    } catch {
      setErrorMessage("That code is invalid or expired. Request a new code and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Continue with email</CardTitle>
        <CardDescription>
          {input.resourceLabel ?? "Analytics"} access requires an email-authenticated session, even
          when you already signed in with GitHub.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Notice tone="info">
          We&apos;ll send a six-digit sign-in code to{" "}
          <span className="font-medium">{input.email}</span>.
        </Notice>

        {step === "verify" ? (
          <Field data-invalid={errorMessage !== null || undefined}>
            <FieldLabel htmlFor="admin-analytics-email-code">Six-digit code</FieldLabel>
            <Input
              id="admin-analytics-email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              aria-invalid={errorMessage !== null || undefined}
              onChange={(event) => {
                setCode(event.currentTarget.value.replace(/\D+/g, "").slice(0, 6));
                setErrorMessage(null);
              }}
            />
            <FieldDescription>
              Enter the latest code we sent to your email to reopen this page.
            </FieldDescription>
          </Field>
        ) : null}

        {errorMessage === null ? null : <Notice tone="destructive">{errorMessage}</Notice>}

        <div className="flex flex-col gap-3 sm:flex-row">
          {step === "request" ? (
            <Button
              className="sm:w-auto"
              disabled={isSubmitting}
              onClick={() => void handleSendCode()}
            >
              {isSubmitting ? <LoaderCircleIcon className="animate-spin" /> : null}
              Send code
            </Button>
          ) : (
            <>
              <Button
                className="sm:w-auto"
                disabled={isSubmitting}
                onClick={() => void handleVerifyCode()}
              >
                {isSubmitting ? <LoaderCircleIcon className="animate-spin" /> : null}
                Verify code
              </Button>
              <Button
                variant="outline"
                className="sm:w-auto"
                disabled={isSubmitting}
                onClick={() => void handleSendCode()}
              >
                Resend code
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
