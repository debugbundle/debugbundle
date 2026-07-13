import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { listServices, type ServiceRecord } from "../../lib/api.js";
import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu.js";
import { Input } from "../ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "../ui/select.js";

const ALL_SCOPE_VALUE = "__all__";
const CUSTOM_SCOPE_VALUE = "__custom__";
const WILDCARD_SCOPE_VALUE = "__wildcard__";
const STANDARD_ENVIRONMENTS = ["production", "staging", "development"];

export interface ProjectScopeOptions {
  services: string[];
  environments: string[];
  isLoading: boolean;
}

export function useProjectScopeOptions(
  projectId: string | null,
  environmentDefault: string
): ProjectScopeOptions {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (projectId === null) {
      setServices([]);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);

    void listServices(projectId)
      .then((records) => {
        if (active) setServices(records);
      })
      .catch(() => {
        if (active) setServices([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  return useMemo(
    () => ({
      services: sortScopeValues(services.map((service) => service.name)),
      environments: sortScopeValues([
        environmentDefault,
        ...STANDARD_ENVIRONMENTS,
        ...services.map((service) => service.environment)
      ]),
      isLoading
    }),
    [environmentDefault, isLoading, services]
  );
}

export function ProjectScopeSelect({
  id,
  label,
  value,
  options,
  onValueChange,
  allLabel,
  includeAll = true,
  wildcardLabel,
  disabled = false,
  className
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
  allLabel: string;
  includeAll?: boolean;
  wildcardLabel?: string;
  disabled?: boolean;
  className?: string;
}): JSX.Element {
  const knownOptions = useMemo(() => sortScopeValues(options), [options]);
  const valueIsKnown = value.length === 0 || value === "*" || knownOptions.includes(value);
  const [customSelected, setCustomSelected] = useState(!valueIsKnown);
  const previousValue = useRef(value);

  useEffect(() => {
    if (previousValue.current !== value && value.length === 0) {
      setCustomSelected(false);
    } else if (value.length > 0 && value !== "*" && !knownOptions.includes(value)) {
      setCustomSelected(true);
    }
    previousValue.current = value;
  }, [knownOptions, value]);

  const selectedValue = customSelected
    ? CUSTOM_SCOPE_VALUE
    : value === "*"
      ? WILDCARD_SCOPE_VALUE
      : value.length === 0
        ? ALL_SCOPE_VALUE
        : value;

  return (
    <>
      <Select
        value={selectedValue}
        disabled={disabled}
        onValueChange={(nextValue) => {
          if (nextValue === ALL_SCOPE_VALUE) {
            setCustomSelected(false);
            onValueChange("");
            return;
          }
          if (nextValue === WILDCARD_SCOPE_VALUE) {
            setCustomSelected(false);
            onValueChange("*");
            return;
          }
          if (nextValue === CUSTOM_SCOPE_VALUE) {
            setCustomSelected(true);
            return;
          }
          setCustomSelected(false);
          onValueChange(nextValue);
        }}
      >
        <SelectTrigger id={id} aria-label={label} className={cn("w-full", className)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            {includeAll ? <SelectItem value={ALL_SCOPE_VALUE}>{allLabel}</SelectItem> : null}
            {wildcardLabel === undefined ? null : (
              <SelectItem value={WILDCARD_SCOPE_VALUE}>{wildcardLabel}</SelectItem>
            )}
          </SelectGroup>
          {knownOptions.length === 0 ? null : (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Known {label.toLowerCase()}s</SelectLabel>
                {knownOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
          <SelectSeparator />
          <SelectGroup>
            <SelectItem value={CUSTOM_SCOPE_VALUE}>Custom {label.toLowerCase()}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {customSelected ? (
        <Input
          id={`${id}-custom`}
          aria-label={`Custom ${label.toLowerCase()}`}
          value={value}
          maxLength={120}
          placeholder={`Enter ${label.toLowerCase()} name`}
          disabled={disabled}
          onChange={(event) => onValueChange(event.currentTarget.value)}
        />
      ) : null}
    </>
  );
}

export function ProjectScopeMultiSelect({
  id,
  label,
  value,
  options,
  onValueChange,
  disabled = false
}: {
  id: string;
  label: string;
  value: string[];
  options: string[];
  onValueChange: (value: string[]) => void;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const selected = useMemo(() => sortScopeValues(value), [value]);
  const availableOptions = useMemo(
    () => sortScopeValues([...options, ...selected]),
    [options, selected]
  );
  const triggerLabel = selected.length === 0 ? `All ${pluralScopeLabel(label)}` : summarizeSelection(selected, label);

  function setSelected(nextValue: string, checked: boolean): void {
    onValueChange(
      checked
        ? sortScopeValues([...selected, nextValue])
        : selected.filter((candidate) => candidate !== nextValue)
    );
  }

  function addCustomValue(): void {
    const normalized = customValue.trim();
    if (normalized.length === 0) return;
    onValueChange(sortScopeValues([...selected, normalized]));
    setCustomValue("");
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full justify-between"
          disabled={disabled}
          aria-label={`${label}: ${triggerLabel}`}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {availableOptions.length === 0 ? (
            <DropdownMenuLabel>No known {pluralScopeLabel(label)} yet</DropdownMenuLabel>
          ) : (
            availableOptions.map((option) => (
              <DropdownMenuCheckboxItem
                key={option}
                checked={selected.includes(option)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => setSelected(option, checked)}
              >
                {option}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="flex items-center gap-2 px-1 py-1">
          <Input
            aria-label={`Add custom ${pluralScopeLabel(label)}`}
            value={customValue}
            maxLength={120}
            placeholder={`Add ${pluralScopeLabel(label)}`}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomValue();
              }
            }}
            onChange={(event) => setCustomValue(event.currentTarget.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Add custom ${pluralScopeLabel(label)}`}
            disabled={customValue.trim().length === 0}
            onClick={addCustomValue}
          >
            <PlusIcon />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function splitScopeValues(value: string): string[] {
  return sortScopeValues(value.split(","));
}

export function joinScopeValues(value: string[]): string {
  return sortScopeValues(value).join(", ");
}

function sortScopeValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort(
    (left, right) => left.localeCompare(right)
  );
}

function summarizeSelection(selected: string[], label: string): string {
  return selected.length === 1 ? selected[0]! : `${selected.length} ${pluralScopeLabel(label)} selected`;
}

function pluralScopeLabel(label: string): string {
  const normalized = label.toLowerCase();
  return normalized.endsWith("s") ? normalized : `${normalized}s`;
}
