import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { snoozeImprovement, type ImprovementRecord } from "../../lib/api.js";
import { showSuccessToast } from "../../lib/notify.js";
import { DialogFormContent } from "./dialog-form-content.js";
import { Button } from "../ui/button.js";
import { Dialog, DialogTrigger } from "../ui/dialog.js";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
export function ImprovementSnoozeDialog({
  improvementId,
  disabled,
  onSnoozed,
  onPendingChange,
  errorMessage
}: {
  improvementId: string;
  disabled: boolean;
  onSnoozed: (record: ImprovementRecord) => void;
  onPendingChange: (pending: boolean) => void;
  errorMessage: (error: unknown) => string;
}): JSX.Element {
  const active = useRef(true);
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const value = until.trim();
  const valid = z.string().datetime().safeParse(value).success && Date.parse(value) > Date.now();
  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!valid || pending || disabled) return;
    setPending(true);
    onPendingChange(true);
    setError(null);
    try {
      const result = await snoozeImprovement(improvementId, value);
      if (!active.current) return;
      onSnoozed(result);
      setOpen(false);
      showSuccessToast("Improvement snoozed successfully.");
    } catch (cause) {
      if (active.current) setError(errorMessage(cause));
    } finally {
      if (active.current) {
        setPending(false);
        onPendingChange(false);
      }
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUntil(new Date(Date.now() + 7 * 86400000).toISOString());
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled || pending}>
          Snooze until...
        </Button>
      </DialogTrigger>
      <DialogFormContent
        title="Snooze improvement"
        description="Choose when this improvement should become active again."
        onSubmit={(event) => void save(event)}
        footer={
          <Button type="submit" disabled={!valid || pending || disabled}>
            {pending ? "Snoozing..." : "Snooze improvement"}
          </Button>
        }
      >
        <Field data-invalid={!valid || undefined}>
          <FieldLabel htmlFor="improvement-snooze-until">Snooze until (UTC)</FieldLabel>
          <Input
            id="improvement-snooze-until"
            value={until}
            disabled={pending}
            aria-invalid={!valid}
            aria-describedby="snooze-until-description"
            onChange={(event) => setUntil(event.currentTarget.value)}
          />
          <FieldDescription id="snooze-until-description">
            {valid ? "ISO 8601 UTC timestamp." : "Enter a valid future ISO 8601 UTC timestamp."}
          </FieldDescription>
        </Field>
        {error === null ? null : <Notice tone="warning">{error}</Notice>}
      </DialogFormContent>
    </Dialog>
  );
}
