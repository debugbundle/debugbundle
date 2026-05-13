// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as routerDom from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";
import { MemoryRouter } from "../../../node_modules/.pnpm/node_modules/react-router-dom/dist/index.js";

import {
  CapacityDialog,
  CheckoutReturnDialog,
  billingReflectsCheckout,
  clearPendingBillingCheckout,
  formatActiveProjectCount,
  formatAllowanceUnitCount,
  formatDate,
  formatPlanName,
  readPendingBillingCheckout,
  writePendingBillingCheckout
} from "../../../apps/web/src/pages/billing-page.tsx";
import { OrganizationMembersPage, ProjectTokensPage, ProjectsPage, sortProjects } from "../../../apps/web/src/pages/management-pages.tsx";
import {
  OrganizationOverviewPage,
  formatActiveProjects,
  formatAllowanceUnits,
  formatBillingSummary,
  formatMembershipSummary
} from "../../../apps/web/src/pages/organization-overview-page.tsx";
import {
  buildAlertConfig,
  describeAlertChannel,
  formatAlertChannel,
  formatAlertCondition,
  formatSeverity,
  getDestinationDescription,
  getDestinationLabel,
  validateAlertRecipientEmail
} from "../../../apps/web/src/pages/project-alerts-page.tsx";
import * as api from "../../../apps/web/src/lib/api.ts";
import * as notify from "../../../apps/web/src/lib/notify.tsx";
import * as sessionModule from "../../../apps/web/src/lib/session.tsx";
import { createBillingSummary, createProject, jsonResponse } from "./web-test-helpers.js";
import { createOrganizationInvite, createOrganizationMember, createProjectToken, createSession } from "./web-test-helpers.js";

function renderProjectTokensPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <routerDom.Routes>
        <routerDom.Route path="/" element={<routerDom.Outlet context={{ projectId: "proj_123" }} />}>
          <routerDom.Route index element={<ProjectTokensPage />} />
        </routerDom.Route>
      </routerDom.Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => jsonResponse(404, { error: "not_found" })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("web page helper coverage", () => {
  it("reads, writes, and clears pending billing checkout state", () => {
    expect(readPendingBillingCheckout()).toBeNull();

    window.sessionStorage.setItem("debugbundle.billing.checkout", "not-json");
    expect(readPendingBillingCheckout()).toBeNull();

    window.sessionStorage.setItem(
      "debugbundle.billing.checkout",
      JSON.stringify({ previousPlan: "starter", targetPlan: "team" })
    );
    expect(readPendingBillingCheckout()).toBeNull();

    writePendingBillingCheckout({ previousPlan: "free", targetPlan: "solo" });
    expect(readPendingBillingCheckout()).toEqual({ previousPlan: "free", targetPlan: "solo" });

    clearPendingBillingCheckout();
    expect(readPendingBillingCheckout()).toBeNull();
  });

  it("returns safely when billing checkout storage is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(readPendingBillingCheckout()).toBeNull();
    expect(() => writePendingBillingCheckout({ previousPlan: "solo", targetPlan: "team" })).not.toThrow();
    expect(() => clearPendingBillingCheckout()).not.toThrow();
  });

  it("detects when billing state reflects a checkout and formats billing labels", () => {
    const baseline = createBillingSummary({ plan: "free", stripe_customer_id: null });
    const updated = createBillingSummary({ plan: "solo", stripe_customer_id: "cus_123" });

    expect(
      billingReflectsCheckout(updated, { previousPlan: "free", targetPlan: "solo" }, baseline)
    ).toBe(true);
    expect(billingReflectsCheckout(baseline, null, null)).toBe(false);
    expect(billingReflectsCheckout(updated, null, baseline)).toBe(true);
    expect(billingReflectsCheckout(baseline, null, createBillingSummary({ plan: "free", stripe_customer_id: null }))).toBe(false);

    expect(formatPlanName("free")).toBe("Free");
    expect(formatPlanName("solo")).toBe("Solo");
    expect(formatPlanName("team")).toBe("Team");
    expect(formatActiveProjectCount(1)).toBe("1 active project");
    expect(formatActiveProjectCount(3)).toBe("3 active projects");
    expect(formatAllowanceUnitCount(1)).toBe("1 allowance unit");
    expect(formatAllowanceUnitCount(4)).toBe("4 allowance units");
    expect(formatDate("2026-04-23T11:56:12.000Z")).toMatch(/2026/);
  });

  it("renders checkout return dialog states", () => {
    const { rerender } = render(<CheckoutReturnDialog state={{ status: "syncing" }} onOpenChange={() => {}} />);

    expect(screen.getByText(/confirming your subscription/i)).toBeInTheDocument();
    expect(screen.getByText(/this usually finishes in a few seconds/i)).toBeInTheDocument();

    rerender(<CheckoutReturnDialog state={{ status: "success" }} onOpenChange={() => {}} />);
    expect(screen.getByText(/free is active/i)).toBeInTheDocument();

    rerender(<CheckoutReturnDialog state={{ status: "delayed" }} onOpenChange={() => {}} />);
    expect(screen.getByText(/payment received/i)).toBeInTheDocument();

    rerender(<CheckoutReturnDialog state={{ status: "canceled" }} onOpenChange={() => {}} />);
    expect(screen.getByText(/checkout canceled/i)).toBeInTheDocument();

    rerender(<CheckoutReturnDialog state={{ status: "error" }} onOpenChange={() => {}} />);
    expect(screen.getByText(/could not confirm billing yet/i)).toBeInTheDocument();
  });

  it("sorts projects across each supported field", () => {
    const projects = [
      createProject({
        project_id: "proj_zeta",
        name: "Zeta",
        slug: "zeta",
        environment_default: "production",
        metrics: {
          monthly_bundle_requests: 20,
          monthly_raw_ingested_events: 100,
          retained_bundles: 3,
          monthly_alert_deliveries: 5
        }
      }),
      createProject({
        project_id: "proj_alpha",
        name: "Alpha",
        slug: "alpha",
        environment_default: "staging",
        metrics: {
          monthly_bundle_requests: 5,
          monthly_raw_ingested_events: 300,
          retained_bundles: 2,
          monthly_alert_deliveries: 4
        }
      })
    ];

    expect(sortProjects(null, { field: "name", direction: "asc" })).toEqual([]);
    expect(sortProjects(projects, { field: "name", direction: "asc" }).map((project) => project.project_id)).toEqual([
      "proj_alpha",
      "proj_zeta"
    ]);
    expect(sortProjects(projects, { field: "slug", direction: "desc" }).map((project) => project.project_id)).toEqual([
      "proj_zeta",
      "proj_alpha"
    ]);
    expect(sortProjects(projects, { field: "environment_default", direction: "asc" }).map((project) => project.project_id)).toEqual([
      "proj_zeta",
      "proj_alpha"
    ]);
    expect(sortProjects(projects, { field: "monthly_bundle_requests", direction: "asc" }).map((project) => project.project_id)).toEqual([
      "proj_alpha",
      "proj_zeta"
    ]);
    expect(
      sortProjects(projects, { field: "monthly_raw_ingested_events", direction: "asc" }).map((project) => project.project_id)
    ).toEqual(["proj_zeta", "proj_alpha"]);
    expect(sortProjects(projects, { field: "unknown" as never, direction: "asc" }).map((project) => project.project_id)).toEqual([
      "proj_zeta",
      "proj_alpha"
    ]);
  });

  it("creates the first project when the initial project load returns an invalid session", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "listProjects").mockRejectedValue(new Error("invalid_session"));
    vi.spyOn(api, "createProject").mockResolvedValue(
      createProject({
        project_id: "proj_first",
        name: "First Project",
        slug: "first-project"
      })
    );

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /create project/i }));
    await user.type(screen.getByLabelText(/project name/i), "First Project");
    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    expect(await screen.findByText(/^first project$/i)).toBeInTheDocument();
  });

  it("creates the first project token when the initial token load returns an invalid session", async () => {
    const user = userEvent.setup();

    vi.spyOn(api, "listProjectTokens").mockRejectedValue(new Error("invalid_session"));
    vi.spyOn(api, "createProjectToken").mockResolvedValue(
      createProjectToken({
        token_id: "proj_tok_bootstrap",
        label: "Bootstrap token",
        plaintext: "dbundle_proj_secret_bootstrap"
      })
    );

    renderProjectTokensPage();

    await user.click(screen.getByRole("button", { name: /create project token/i }));
    await user.type(screen.getByLabelText(/token label/i), "Bootstrap token");
    await user.click(screen.getByRole("button", { name: /^create token$/i }));

    expect(await screen.findByText(/bootstrap token/i)).toBeInTheDocument();
    expect(screen.getByText(/dbundle_proj_secret_bootstrap/i)).toBeInTheDocument();
  });

  it("renders used project tokens without the never-used placeholder", async () => {
    vi.spyOn(api, "listProjectTokens").mockResolvedValue([
      createProjectToken({
        last_used_at: "2026-04-20T11:56:12.000Z"
      })
    ]);

    renderProjectTokensPage();

    expect(await screen.findByText(/production ingest/i)).toBeInTheDocument();
    expect(screen.queryByText(/^never$/i)).toBeNull();
  });

  it("creates the first organization invite when the initial member load returns an invalid session", async () => {
    const user = userEvent.setup();

    vi.spyOn(sessionModule, "useSession").mockReturnValue({
      session: createSession(),
      isLoading: false,
      sessionInvalidationCount: 0,
      refreshSession: vi.fn(async () => createSession()),
      setSession: vi.fn()
    });
    vi.spyOn(api, "listOrganizationMembers").mockRejectedValue(new Error("invalid_session"));
    vi.spyOn(api, "listOrganizationInvites").mockRejectedValue(new Error("invalid_session"));
    vi.spyOn(api, "inviteOrganizationMember").mockResolvedValue(
      createOrganizationInvite({ invite_id: "inv_bootstrap", email: "bootstrap@example.com" })
    );

    render(<OrganizationMembersPage />);

    await user.click(screen.getByRole("button", { name: /invite member/i }));
    await user.type(screen.getByLabelText(/email address/i), "bootstrap@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText(/bootstrap@example.com/i)).toBeInTheDocument();
  });

  it("renders the organization member empty state", async () => {
    vi.spyOn(sessionModule, "useSession").mockReturnValue({
      session: createSession(),
      isLoading: false,
      sessionInvalidationCount: 0,
      refreshSession: vi.fn(async () => createSession()),
      setSession: vi.fn()
    });
    vi.spyOn(api, "listOrganizationMembers").mockResolvedValue([]);
    vi.spyOn(api, "listOrganizationInvites").mockResolvedValue([]);

    render(<OrganizationMembersPage />);

    expect(await screen.findByText(/no members found/i)).toBeInTheDocument();
  });

  it("formats organization overview summaries", () => {
    expect(formatActiveProjects(null)).toBeNull();
    expect(formatActiveProjects(1)).toBe("1 active project");
    expect(formatActiveProjects(2)).toBe("2 active projects");

    expect(formatMembershipSummary(null)).toBe("Loading member summary...");
    expect(formatMembershipSummary({ members: 1, invites: 1 })).toBe("1 member and 1 pending invite.");
    expect(formatMembershipSummary({ members: 2, invites: 0 })).toBe("2 members and 0 pending invites.");

    expect(formatAllowanceUnits(1)).toBe("1 allowance unit");
    expect(formatAllowanceUnits(3)).toBe("3 allowance units");
    expect(formatBillingSummary(null)).toBe("Loading billing summary...");
    expect(
      formatBillingSummary(
        createBillingSummary({
          plan: "solo",
          active_projects: 1,
          capacity_units: {
            total: 1,
            included: 1,
            additional_purchased: 0,
            pending_reduction: null
          }
        })
      )
    ).toBe("solo plan with 1 active project and 1 allowance unit.");
  });

  it("renders organization overview summaries for owner sessions", async () => {
    vi.spyOn(sessionModule, "useSession").mockReturnValue({
      session: createSession(),
      isLoading: false,
      sessionInvalidationCount: 0,
      refreshSession: vi.fn(async () => createSession()),
      setSession: vi.fn()
    });
    vi.spyOn(api, "listProjects").mockResolvedValue([
      createProject(),
      createProject({ project_id: "proj_456", name: "Worker", slug: "worker" })
    ]);
    vi.spyOn(api, "listOrganizationMembers").mockResolvedValue([
      createOrganizationMember(),
      createOrganizationMember({ user_id: "usr_456", email: "casey@example.com", role: "member" })
    ]);
    vi.spyOn(api, "listOrganizationInvites").mockResolvedValue([createOrganizationInvite()]);
    vi.spyOn(api, "getBillingSummary").mockResolvedValue(
      createBillingSummary({
        plan: "team",
        active_projects: 2,
        capacity_units: {
          total: 5,
          included: 3,
          additional_purchased: 2,
          pending_reduction: null
        }
      })
    );

    render(
      <MemoryRouter>
        <OrganizationOverviewPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/^2 active projects$/i)).toBeInTheDocument();
    expect(screen.getByText(/2 members and 1 pending invite/i)).toBeInTheDocument();
    expect(screen.getByText(/team plan with 2 active projects and 5 allowance units/i)).toBeInTheDocument();
  });

  it("handles null, forbidden, and invalid-session organization overview states", async () => {
    vi.spyOn(api, "listProjects").mockRejectedValue(new Error("invalid_session"));

    vi.spyOn(sessionModule, "useSession").mockReturnValue({
      session: null,
      isLoading: false,
      sessionInvalidationCount: 0,
      refreshSession: vi.fn(async () => null),
      setSession: vi.fn()
    });

    const emptyView = render(
      <MemoryRouter>
        <OrganizationOverviewPage />
      </MemoryRouter>
    );

    expect(emptyView.container).toBeEmptyDOMElement();
    emptyView.unmount();

    vi.spyOn(sessionModule, "useSession").mockReturnValue({
      session: createSession(),
      isLoading: false,
      sessionInvalidationCount: 0,
      refreshSession: vi.fn(async () => createSession()),
      setSession: vi.fn()
    });
    vi.spyOn(api, "listOrganizationMembers").mockRejectedValue(new Error("forbidden"));
    vi.spyOn(api, "listOrganizationInvites").mockResolvedValue([]);
    vi.spyOn(api, "getBillingSummary").mockRejectedValue(new Error("invalid_session"));

    render(
      <MemoryRouter>
        <OrganizationOverviewPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/owner permissions are required to manage members/i)).toBeInTheDocument();
    expect(screen.getByText(/loading billing summary/i)).toBeInTheDocument();
  });

  it("surfaces billing capacity dialog error and cancel paths", async () => {
    const user = userEvent.setup();
    const billing = createBillingSummary({
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 3,
      capacity_units: {
        total: 4,
        included: 2,
        additional_purchased: 2,
        pending_reduction: null
      }
    });
    const onBillingChange = vi.fn();
    const showErrorToast = vi.spyOn(notify, "showErrorToast").mockImplementation(() => undefined);
    const showSuccessToast = vi.spyOn(notify, "showSuccessToast").mockImplementation(() => undefined);

    vi.spyOn(api, "increaseBillingCapacity")
      .mockRejectedValueOnce(new Error("pending_capacity_reduction_exists"))
      .mockRejectedValueOnce(new Error("invalid_target_quantity"));
    vi.spyOn(api, "scheduleBillingCapacityReduction").mockRejectedValue(new Error("invalid_target_quantity"));
    vi.spyOn(api, "cancelBillingCapacityReduction").mockResolvedValue(
      createBillingSummary({
        plan: "solo",
        stripe_customer_id: "cus_123",
        active_projects: 3,
        capacity_units: {
          total: 4,
          included: 2,
          additional_purchased: 2,
          pending_reduction: null
        }
      })
    );

    const { rerender } = render(
      <CapacityDialog billing={billing} canChangeBilling={true} open={true} onOpenChange={() => {}} onBillingChange={onBillingChange} />
    );

    await user.click(screen.getByRole("button", { name: /increase capacity now/i }));
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith("Cancel the scheduled reduction before adding more capacity units.");
    });

    await user.click(screen.getByRole("button", { name: /increase capacity now/i }));
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith("Choose a unit count above your current purchased quantity.");
    });

    await user.click(screen.getByRole("button", { name: /schedule reduction/i }));
    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalledWith("Choose a unit count below your current purchased quantity.");
    });

    rerender(
      <CapacityDialog
        billing={createBillingSummary({
          plan: "solo",
          stripe_customer_id: "cus_123",
          active_projects: 3,
          capacity_units: {
            total: 4,
            included: 2,
            additional_purchased: 2,
            pending_reduction: {
              additional_purchased: 0,
              total: 2,
              effective_at: "2026-04-23T11:56:12.000Z"
            }
          }
        })}
        canChangeBilling={true}
        open={true}
        onOpenChange={() => {}}
        onBillingChange={onBillingChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /keep current units/i }));
    await waitFor(() => {
      expect(onBillingChange).toHaveBeenCalled();
      expect(showSuccessToast).toHaveBeenCalledWith("Scheduled capacity reduction cancelled successfully.");
    });
  });

  it("applies successful billing capacity increases", async () => {
    const user = userEvent.setup();
    const nextBilling = createBillingSummary({
      plan: "solo",
      stripe_customer_id: "cus_123",
      active_projects: 3,
      capacity_units: {
        total: 5,
        included: 2,
        additional_purchased: 3,
        pending_reduction: null
      }
    });
    const onBillingChange = vi.fn();
    const showSuccessToast = vi.spyOn(notify, "showSuccessToast").mockImplementation(() => undefined);

    vi.spyOn(api, "increaseBillingCapacity").mockResolvedValue(nextBilling);

    render(
      <CapacityDialog
        billing={createBillingSummary({
          plan: "solo",
          stripe_customer_id: "cus_123",
          active_projects: 3,
          capacity_units: {
            total: 4,
            included: 2,
            additional_purchased: 2,
            pending_reduction: null
          }
        })}
        canChangeBilling={true}
        open={true}
        onOpenChange={() => {}}
        onBillingChange={onBillingChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /increase capacity now/i }));

    await waitFor(() => {
      expect(onBillingChange).toHaveBeenCalledWith(nextBilling);
      expect(showSuccessToast).toHaveBeenCalledWith("Allowance capacity increased successfully.");
    });
  });

  it("formats alert channel metadata and builds alert config variants", () => {
    expect(formatAlertChannel("slack")).toBe("Slack");
    expect(formatAlertChannel("discord" as never)).toBe("Discord");
    expect(formatAlertCondition("error_spike")).toBe("Error spike");
    expect(formatAlertCondition("unknown_condition" as never)).toBe("unknown_condition");
    expect(formatSeverity("critical")).toBe("Critical");
    expect(formatSeverity("emergency" as never)).toBe("emergency");

    expect(describeAlertChannel("email")).toMatch(/single email recipient/i);
    expect(describeAlertChannel("webhook")).toMatch(/separate from the Webhooks tab/i);
    expect(describeAlertChannel("slack")).toMatch(/Slack channel/i);
    expect(describeAlertChannel("discord" as never)).toMatch(/Discord channel/i);

    expect(getDestinationLabel("slack")).toBe("Slack webhook URL");
    expect(getDestinationLabel("discord" as never)).toBe("Discord webhook URL");
    expect(getDestinationLabel("webhook")).toBe("Webhook endpoint URL");
    expect(getDestinationDescription("slack")).toMatch(/Slack incoming webhook URL/i);
    expect(getDestinationDescription("discord" as never)).toMatch(/Discord webhook URL/i);
    expect(getDestinationDescription("webhook")).toMatch(/Matched alert events will be POSTed/i);

    expect(validateAlertRecipientEmail("")).toBe("Enter the email address that should receive this alert.");
    expect(validateAlertRecipientEmail("broken")).toBe("Enter a valid email address for this alert.");
    expect(validateAlertRecipientEmail("alerts@example.com")).toBeUndefined();

    expect(buildAlertConfig({ channel: "email", emailRecipient: "alerts@example.com", destinationUrl: "" })).toEqual({
      to: "alerts@example.com"
    });
    expect(buildAlertConfig({ channel: "email", emailRecipient: "broken", destinationUrl: "" })).toBeNull();
    expect(buildAlertConfig({ channel: "webhook", emailRecipient: "", destinationUrl: "" })).toBeNull();
    expect(buildAlertConfig({ channel: "webhook", emailRecipient: "", destinationUrl: "https://alerts.example.test/webhook" })).toEqual({
      target_url: "https://alerts.example.test/webhook"
    });
    expect(buildAlertConfig({ channel: "slack", emailRecipient: "", destinationUrl: "https://alerts.example.test/slack" })).toEqual({
      webhook_url: "https://alerts.example.test/slack"
    });
    expect(buildAlertConfig({ channel: "discord" as never, emailRecipient: "", destinationUrl: "https://alerts.example.test/discord" })).toEqual({
      webhook_url: "https://alerts.example.test/discord"
    });
  });
});
