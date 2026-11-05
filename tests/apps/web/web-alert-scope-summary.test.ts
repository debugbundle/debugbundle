import { expect, it } from "vitest";
import { formatAlertScope, getAlertScope } from "../../../apps/web/src/lib/alert-scope.js";
import { APP_DEFINITION, APP_PRODUCTION, appScope, globalScope } from "./helpers/alert-scopes.js";

it("distinguishes allowed coverage from an explicit service filter", () => {
  const alert = {
    service_id: APP_PRODUCTION,
    scope: {
      ...globalScope(),
      service_filter: {
        service_id: APP_PRODUCTION,
        service_definition_id: APP_DEFINITION,
        name: "Renamed App",
        environment: "staging"
      }
    }
  };
  expect(formatAlertScope(alert)).toBe("Renamed App (staging)");
  expect(formatAlertScope(alert, "allowed")).toBe("All services");
});

it("bounds displayed service names and reports the exact undisplayed count", () => {
  expect(formatAlertScope({ service_id: null, scope: { ...appScope(), service_count: 9 } })).toBe(
    "App and 8 more"
  );
  expect(
    formatAlertScope({ service_id: null, scope: { ...appScope(), services: [], service_count: 9 } })
  ).toBe("9 services in this scope");
  expect(
    formatAlertScope({ service_id: null, scope: { ...appScope(), services: [], service_count: 0 } })
  ).toBe("No services currently observed in this scope");
});

it("never interprets absent, malformed or mismatched metadata as global coverage", () => {
  expect(formatAlertScope({ service_id: null })).toBe("Scope unavailable");
  expect(formatAlertScope({ service_id: null, scope: null })).toBe("Scope unavailable");
  expect(formatAlertScope({ service_id: APP_PRODUCTION, scope: globalScope() })).toBe(
    "Scope unavailable"
  );
  const malformed = { ...globalScope(), service_count: 0 };
  expect(getAlertScope({ service_id: null, scope: malformed })).toBeNull();
});
