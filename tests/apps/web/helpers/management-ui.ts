import { fireEvent, screen } from "@testing-library/react";
import type { userEvent } from "@testing-library/user-event";
import type {
  AvailabilityCheckDailyRollupRecord,
  AvailabilityCheckRecord
} from "../../../../apps/web/src/lib/api.js";

async function findSelectTrigger(label: RegExp | string): Promise<HTMLElement> {
  return await screen.findByLabelText(label);
}

export async function openSelect(label: RegExp | string): Promise<HTMLElement> {
  const trigger = await findSelectTrigger(label);
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  return trigger;
}

export async function openProjectSettingsSection(name: string): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name }));
}

export async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp | string,
  optionName: RegExp | string
): Promise<void> {
  await openSelect(label);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

export async function addCustomScopeValues(
  user: ReturnType<typeof userEvent.setup>,
  label: "Services" | "Environments",
  values: string[]
): Promise<void> {
  for (const value of values) {
    await user.click(screen.getByRole("button", { name: new RegExp(`^${label}:`, "i") }));
    await user.type(
      screen.getByRole("textbox", { name: new RegExp(`add custom ${label}`, "i") }),
      value
    );
    await user.click(screen.getByRole("button", { name: new RegExp(`add custom ${label}`, "i") }));
  }
}

export function createHealthCheck(
  overrides: Partial<AvailabilityCheckRecord> = {}
): AvailabilityCheckRecord {
  return {
    check_id: "chk_123",
    project_id: "proj_123",
    name: "Primary app",
    url: "https://app.example.com/health",
    method: "GET",
    expected_status_min: 200,
    expected_status_max: 399,
    timeout_ms: 5000,
    interval_seconds: 60,
    failure_threshold: 3,
    recovery_threshold: 2,
    environment: "production",
    service_name: "web",
    enabled: true,
    status: "passing",
    paused_reason: null,
    organization_plan: "team",
    consecutive_failures: 0,
    consecutive_successes: 12,
    linked_incident_id: null,
    linked_incident_status: null,
    last_checked_at: "2026-06-15T10:00:00.000Z",
    next_check_at: "2026-06-15T10:01:00.000Z",
    last_result_status: "success",
    last_result_http_status: 200,
    last_result_error_kind: null,
    last_result_error_message: null,
    last_result_duration_ms: 180,
    created_at: "2026-06-15T09:00:00.000Z",
    updated_at: "2026-06-15T10:00:00.000Z",
    ...overrides
  };
}

export function createHealthRollup(
  overrides: Partial<AvailabilityCheckDailyRollupRecord> = {}
): AvailabilityCheckDailyRollupRecord {
  return {
    check_id: "chk_123",
    project_id: "proj_123",
    day: "2026-06-15",
    state: "operational",
    total_checks: 1250,
    successful_checks: 1250,
    failed_checks: 0,
    degraded_checks: 0,
    avg_duration_ms: 180,
    first_checked_at: "2026-06-15T00:00:00.000Z",
    last_checked_at: "2026-06-15T23:59:00.000Z",
    downtime_seconds: 0,
    incident_ids: [],
    ...overrides
  };
}
