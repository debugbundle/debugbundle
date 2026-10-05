import { useId, useState } from "react";
import {
  AnalyticsFlowDefinitionInputSchema,
  type AnalyticsFlowDefinitionInput
} from "../../../../../packages/shared-types/src/index.js";
import { Button } from "../ui/button.js";
import { Field, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.js";
const emptyStep = (): AnalyticsFlowDefinitionInput["steps"][number] => ({
  step_key: "",
  display_name: "",
  origin: ""
});
export function AnalyticsFlowForm({
  initial,
  onSave,
  onCancel,
  busy,
  error
}: {
  initial?: AnalyticsFlowDefinitionInput;
  onSave: (definition: AnalyticsFlowDefinitionInput) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}): JSX.Element {
  const id = useId();
  const [draft, setDraft] = useState<AnalyticsFlowDefinitionInput>(
    () =>
      initial ?? {
        flow_key: "",
        display_name: "",
        kind: "acquisition",
        timeout_minutes: 60,
        steps: [emptyStep(), emptyStep()]
      }
  );
  const [validation, setValidation] = useState<string | null>(null);
  function updateStep(
    index: number,
    key: "step_key" | "display_name" | "origin",
    value: string
  ): void {
    setDraft((old) => ({
      ...old,
      steps: old.steps.map((step, i) => (i === index ? { ...step, [key]: value } : step))
    }));
  }
  return (
    <form
      className="flex flex-col gap-4"
      aria-label={initial ? "Edit flow" : "Create flow"}
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = AnalyticsFlowDefinitionInputSchema.safeParse(draft);
        if (!parsed.success) {
          setValidation(parsed.error.issues[0]?.message ?? "Check the flow fields.");
          return;
        }
        setValidation(null);
        onSave(parsed.data);
      }}
    >
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <legend className="mb-3 font-medium">{initial ? "Edit flow" : "Create flow"}</legend>
        {initial && (
          <Notice tone="info" title="New report version">
            Changing a definition starts a new report version. Existing runs cannot advance in the
            new version.
          </Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Flow name</FieldLabel>
            <Input
              id={`${id}-name`}
              maxLength={120}
              required
              value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-key`}>Flow key</FieldLabel>
            <Input
              id={`${id}-key`}
              maxLength={64}
              required
              disabled={!!initial}
              value={draft.flow_key}
              placeholder="onboarding"
              onChange={(e) => setDraft({ ...draft, flow_key: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-kind`}>Purpose</FieldLabel>
            <Select
              value={draft.kind}
              onValueChange={(value) =>
                setDraft({ ...draft, kind: value as AnalyticsFlowDefinitionInput["kind"] })
              }
            >
              <SelectTrigger id={`${id}-kind`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="acquisition">Acquisition</SelectItem>
                <SelectItem value="activation">Activation</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-timeout`}>Expiry (minutes)</FieldLabel>
            <Input
              id={`${id}-timeout`}
              type="number"
              min={10}
              max={1440}
              required
              value={draft.timeout_minutes}
              onChange={(e) => setDraft({ ...draft, timeout_minutes: Number(e.target.value) })}
            />
          </Field>
        </div>
        <p className="text-sm text-muted-foreground">
          Use two to eight ordered steps. Record successful actions explicitly. Each origin includes
          only the scheme and host, such as https://auth.example.com.
        </p>
        {draft.steps.map((step, index) => (
          <fieldset key={index} className="rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Step {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor={`${id}-${index}-name`}>Step {index + 1} name</FieldLabel>
                <Input
                  id={`${id}-${index}-name`}
                  required
                  maxLength={120}
                  value={step.display_name}
                  onChange={(e) => updateStep(index, "display_name", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-${index}-key`}>Step {index + 1} key</FieldLabel>
                <Input
                  id={`${id}-${index}-key`}
                  required
                  maxLength={64}
                  value={step.step_key}
                  onChange={(e) => updateStep(index, "step_key", e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-${index}-origin`}>Step {index + 1} origin</FieldLabel>
                <Input
                  id={`${id}-${index}-origin`}
                  required
                  type="url"
                  maxLength={255}
                  value={step.origin}
                  onChange={(e) => updateStep(index, "origin", e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={index === 0}
                onClick={() =>
                  setDraft((old) => {
                    const steps = [...old.steps];
                    [steps[index - 1], steps[index]] = [steps[index]!, steps[index - 1]!];
                    return { ...old, steps };
                  })
                }
              >
                Move step {index + 1} up
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={draft.steps.length <= 2}
                onClick={() =>
                  setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })
                }
              >
                Remove step {index + 1}
              </Button>
            </div>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.steps.length >= 8}
          onClick={() => setDraft({ ...draft, steps: [...draft.steps, emptyStep()] })}
        >
          Add step
        </Button>
        {(validation || error) && (
          <Notice tone="destructive" title="Unable to save flow">
            {validation ?? error}
          </Notice>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save flow"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
