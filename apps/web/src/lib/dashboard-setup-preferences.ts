import {
  parseDashboardSetupPreferences,
  type DashboardSetupPreferences
} from "../../../../packages/shared-types/src/dashboard-setup.js";

// This fallback lasts only for this app instance when browser storage is unavailable.
const memory = new Map<string, DashboardSetupPreferences>();
export function dashboardSetupStorageKey(userId: string, organizationId: string): string {
  return `debugbundle.dashboard-setup.v1:${encodeURIComponent(userId)}:${encodeURIComponent(organizationId)}`;
}
export function readDashboardSetupPreferences(key: string): DashboardSetupPreferences {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return parseDashboardSetupPreferences(value);
  } catch {
    return memory.get(key) ?? parseDashboardSetupPreferences(null);
  }
  return parseDashboardSetupPreferences(null);
}
export function writeDashboardSetupPreferences(
  key: string,
  preferences: DashboardSetupPreferences
): void {
  memory.set(key, preferences);
  try {
    window.localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    /* Optional display preferences never block the dashboard. */
  }
}
