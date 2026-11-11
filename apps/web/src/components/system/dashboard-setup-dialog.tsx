import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon, CheckIcon, CircleHelpIcon, CircleIcon, CopyIcon } from "lucide-react";
import {
  DASHBOARD_SETUP_PROMPT,
  type dashboardSetupProgress,
  type DashboardSetupStep
} from "../../../../../packages/shared-types/src/dashboard-setup.js";
import { showSuccessToast } from "../../lib/notify.js";
import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";
import { Badge } from "../ui/badge.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "../ui/dialog.js";
import { Field, FieldLabel } from "../ui/field.js";
import { Notice } from "../ui/notice.js";
import { Separator } from "../ui/separator.js";
import { Skeleton } from "../ui/skeleton.js";
import { Textarea } from "../ui/textarea.js";
import { PendingButton } from "./pending-button.js";
import { BrandMark } from "./brand-mark.js";
import { MetadataSeparator } from "./metadata-separator.js";
import { TableRefreshButton } from "./table-refresh-button.js";

interface DashboardSetupDialogProps {
  mode: "welcome" | "guide" | null;
  progress: ReturnType<typeof dashboardSetupProgress>;
  loading: boolean;
  refreshing: boolean;
  onClose: () => void;
  onShowGuide: () => void;
  onRefresh: () => void;
  onCloseAutoFocus: React.ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
}

export function DashboardSetupDialog({
  mode,
  progress,
  loading,
  refreshing,
  onClose,
  onShowGuide,
  onRefresh,
  onCloseAutoFocus
}: DashboardSetupDialogProps): JSX.Element {
  const [copyFailed, setCopyFailed] = useState(false);
  const [copying, setCopying] = useState(false);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const copyRequest = useRef(0);
  // Radix retains the outgoing content until its exit animation completes.
  const lastOpenMode = useRef<"welcome" | "guide">(mode ?? "welcome");
  const welcome = (mode ?? lastOpenMode.current) === "welcome";
  const essential = progress.steps.filter((step) => !step.optional);
  const optional = progress.steps.filter((step) => step.optional);
  useEffect(() => {
    setCopying(false);
    if (mode === null) {
      setCopyFailed(false);
    } else {
      lastOpenMode.current = mode;
    }
    return () => {
      copyRequest.current += 1;
    };
  }, [mode]);
  useEffect(() => {
    if (copyFailed) {
      prompt.current?.focus();
      prompt.current?.select();
    }
  }, [copyFailed]);

  async function copyPrompt(): Promise<void> {
    const request = ++copyRequest.current;
    setCopying(true);
    setCopyFailed(false);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(DASHBOARD_SETUP_PROMPT);
      if (request !== copyRequest.current) return;
      showSuccessToast("Setup prompt copied. Paste it into your project's coding agent.");
    } catch {
      if (request === copyRequest.current) {
        setCopyFailed(true);
      }
    } finally {
      if (request === copyRequest.current) setCopying(false);
    }
  }

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        size="lg"
        padding="none"
        surface="raised"
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-6",
            welcome ? "sm:gap-8 sm:p-10" : "sm:p-8"
          )}
        >
          <DialogHeader className="items-center gap-3 text-center">
            {welcome ? <BrandMark className="mb-2 size-12" /> : null}
            <DialogTitle className="text-2xl font-semibold leading-tight">
              {welcome ? "Welcome to DebugBundle" : "Your setup guide"}
            </DialogTitle>
            <DialogDescription className="max-w-md text-balance leading-relaxed">
              {welcome
                ? "Let’s connect your first app. Your coding agent can help with setup and bring your first incident into view."
                : "A few steps to get connected. Come back here whenever you need a hand."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div
              className={cn(
                "flex items-center justify-center gap-2",
                welcome ? "flex-col sm:flex-row" : "flex-wrap"
              )}
            >
              <PendingButton
                className={welcome ? "w-full sm:w-auto" : undefined}
                pending={copying}
                pendingLabel="Copying…"
                icon={<CopyIcon data-icon="inline-start" />}
                onClick={() => void copyPrompt()}
              >
                Copy setup prompt
              </PendingButton>
              {welcome ? (
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link to="/access-tokens" onClick={onClose}>
                    Create access token
                  </Link>
                </Button>
              ) : null}
            </div>
            {welcome ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Paste the prompt into your project’s coding agent. Create an Access token when it
                  needs access.
                </p>
              </div>
            ) : null}
            {copyFailed ? (
              <div className="flex flex-col gap-3 pt-2 text-left">
                <Notice tone="warning" title="Copy the prompt manually">
                  Automatic copying is unavailable. Select and copy the prompt below.
                </Notice>
                <Field>
                  <FieldLabel htmlFor="dashboard-setup-prompt">Setup prompt</FieldLabel>
                  <Textarea
                    id="dashboard-setup-prompt"
                    ref={prompt}
                    readOnly
                    rows={7}
                    value={DASHBOARD_SETUP_PROMPT}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </Field>
              </div>
            ) : null}
          </div>
          {welcome ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Take it at your own pace. Your setup checklist will be waiting in the sidebar.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="ghost" onClick={onClose}>
                  I’ll do this later
                </Button>
                <Button variant="ghost" onClick={onShowGuide}>
                  View setup steps
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </div>
            </div>
          ) : loading ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium" aria-live="polite">
                  {progress.ready
                    ? "Essential setup complete"
                    : `${progress.completed} of ${progress.total} essentials complete`}
                </p>
                <TableRefreshButton isLoading={refreshing} onRefresh={onRefresh} />
              </div>
              <SetupStepList steps={essential} onNavigate={onClose} />
              {optional.length > 0 ? (
                <>
                  <Separator />
                  <h3 className="text-sm font-medium">
                    Make more of your plan
                    <MetadataSeparator />
                    <span className="font-normal text-muted-foreground">Optional</span>
                  </h3>
                  <SetupStepList steps={optional} onNavigate={onClose} />
                </>
              ) : null}
              <Button variant="ghost" className="self-center" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SetupStepList({
  steps,
  onNavigate
}: {
  steps: DashboardSetupStep[];
  onNavigate: () => void;
}): JSX.Element {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step) => {
        const Icon =
          step.status === "complete"
            ? CheckIcon
            : step.status === "unavailable"
              ? CircleHelpIcon
              : CircleIcon;
        return (
          <li key={step.id} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{step.title}</span>
                {step.status === "complete" ? <Badge variant="secondary">Done</Badge> : null}
              </div>
              {step.status !== "complete" ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.status === "unavailable"
                    ? "We couldn’t check this step. Refresh progress to try again."
                    : step.description}
                </p>
              ) : null}
            </div>
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link
                to={step.href}
                onClick={onNavigate}
                aria-label={step.action}
                title={step.action}
              >
                <ArrowRightIcon />
              </Link>
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
