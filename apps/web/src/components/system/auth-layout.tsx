import type { ReactNode } from "react";

import { cn } from "../../lib/utils.js";
import { Card, CardContent, CardDescription, CardHeader } from "../ui/card.js";
import { FieldDescription } from "../ui/field.js";
import { BrandLockup } from "./brand-lockup.js";

const TERMS_OF_SERVICE_URL = "https://debugbundle.com/terms";
const PRIVACY_POLICY_URL = "https://debugbundle.com/privacy";

export function AuthLayout({
  title,
  heading = title,
  description,
  children,
  contentClassName
}: {
  title: string;
  heading?: string;
  description: string;
  children: ReactNode;
  contentClassName?: string;
}): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-6 text-foreground md:p-10">
      <div className={cn("flex w-full max-w-md flex-col gap-6", contentClassName)}>
        <div className="flex justify-center">
          <BrandLockup href="/login" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <h1 className="text-xl font-semibold">{heading}</h1>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>

        <FieldDescription className="px-6 text-center text-balance">
          By continuing, you agree to our{" "}
          <a
            href={TERMS_OF_SERVICE_URL}
            className="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href={PRIVACY_POLICY_URL}
            className="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
          .
        </FieldDescription>
      </div>
    </div>
  );
}
