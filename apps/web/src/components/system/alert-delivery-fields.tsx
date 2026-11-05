import { useEffect, useState } from "react";
import { listServices, type AlertRecord, type ServiceRecord } from "../../lib/api.js";
import { getAlertScope } from "../../lib/alert-scope.js";
import { AlertScopeSummary } from "./alert-scope-summary.js";
import { Field, FieldDescription, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";
import { Switch } from "../ui/switch.js";
import { Checkbox } from "../ui/checkbox.js";

export function AlertDeliveryFields({
  projectId,
  serviceId,
  setServiceId,
  enabled,
  setEnabled,
  digestWindow,
  setDigestWindow,
  cooldownScope,
  setCooldownScope,
  signingRequested,
  setSigningRequested,
  editingAlertId,
  editingAlert,
  channel
}: {
  projectId: string;
  editingAlertId: string | null;
  editingAlert: AlertRecord | null;
  serviceId: string;
  setServiceId: (value: string) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  digestWindow: string;
  setDigestWindow: (value: string) => void;
  cooldownScope: string;
  setCooldownScope: (value: string) => void;
  signingRequested: boolean;
  setSigningRequested: (value: boolean) => void;
  channel: "email" | "slack" | "discord" | "webhook";
}): JSX.Element {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [servicesError, setServicesError] = useState(false);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setServices([]);
    setServicesError(false);
    setServicesLoaded(false);
    void listServices(projectId).then(
      (records) => {
        if (active) {
          setServices(records);
          setServicesLoaded(true);
        }
      },
      () => {
        if (active) setServicesError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [projectId]);
  const scope = editingAlert ? getAlertScope(editingAlert) : null;
  const scopeUnavailable = editingAlertId !== null && scope === null;
  const eligibleServices =
    scope === null
      ? services
      : services.filter((service) => scope.origin_project_ids.includes(service.project_id));
  const serviceDisabled = scopeUnavailable || !servicesLoaded || servicesError;
  const selectedService = scope?.service_filter;
  const unfilteredLabel = scopeUnavailable
    ? "Scope unavailable"
    : scope && !scope.covers_current_project
      ? "All services in this scope"
      : "All services";
  return (
    <>
      <Field data-disabled={serviceDisabled}>
        <FieldLabel htmlFor="project-alert-service">Service scope</FieldLabel>
        <Select
          disabled={serviceDisabled}
          value={serviceId || "__all__"}
          onValueChange={(value) => setServiceId(value === "__all__" ? "" : value)}
        >
          <SelectTrigger
            id="project-alert-service"
            className="w-full"
            aria-describedby="project-alert-service-description"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="__all__">{unfilteredLabel}</SelectItem>
              {serviceId &&
              !eligibleServices.some((service) => service.service_id === serviceId) ? (
                <SelectItem value={serviceId}>
                  {selectedService
                    ? `${selectedService.name} (${selectedService.environment})`
                    : "Current service filter (preserved)"}
                </SelectItem>
              ) : null}
              {eligibleServices.map((service) => (
                <SelectItem key={service.service_id} value={service.service_id}>
                  {service.name} ({service.environment})
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription id="project-alert-service-description">
          Rule scope:{" "}
          {editingAlertId === null ? (
            "All services"
          ) : editingAlert ? (
            <AlertScopeSummary alert={editingAlert} mode="allowed" />
          ) : (
            "Scope unavailable"
          )}
          .
          {scopeUnavailable
            ? " The current service filter is preserved when saving other fields."
            : null}
        </FieldDescription>
        {servicesError ? (
          <FieldDescription>
            Could not load services. The current scope is preserved.
          </FieldDescription>
        ) : null}
      </Field>
      {channel === "email" ? (
        <Field>
          <FieldLabel htmlFor="project-alert-digest">Digest window (seconds)</FieldLabel>
          <Input
            id="project-alert-digest"
            type="number"
            min={1}
            max={300}
            step={1}
            value={digestWindow}
            onChange={(event) => setDigestWindow(event.currentTarget.value)}
          />
          <FieldDescription>Leave empty for the default 10-second window.</FieldDescription>
        </Field>
      ) : (
        <Field>
          <FieldLabel htmlFor="project-alert-cooldown-scope">Cooldown scope</FieldLabel>
          <Select
            value={cooldownScope || "__default__"}
            onValueChange={(value) => setCooldownScope(value === "__default__" ? "" : value)}
          >
            <SelectTrigger id="project-alert-cooldown-scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__default__">Incident (default)</SelectItem>
                <SelectItem value="incident">Incident</SelectItem>
                <SelectItem value="project">Project</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field orientation="horizontal">
        <Switch id="project-alert-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <FieldLabel htmlFor="project-alert-enabled">Enabled</FieldLabel>
      </Field>
      {channel === "webhook" ? (
        <Field orientation="horizontal">
          <Checkbox
            id="project-alert-signing"
            checked={signingRequested}
            onCheckedChange={(checked) => setSigningRequested(checked === true)}
          />
          <div>
            <FieldLabel htmlFor="project-alert-signing">
              {editingAlertId === null ? "Reveal signing secret" : "Rotate signing secret"}
            </FieldLabel>
            <FieldDescription>
              {editingAlertId === null
                ? "Copy the verification key after creation."
                : "Rotation replaces the active key immediately. Update your receiver with the new key."}
            </FieldDescription>
          </div>
        </Field>
      ) : null}
    </>
  );
}
