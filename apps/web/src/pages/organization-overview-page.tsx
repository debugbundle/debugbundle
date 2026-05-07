import { CreditCardIcon, FolderKanbanIcon, ShieldCheckIcon, UsersRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { CalloutCard } from "../components/system/callout-card.js";
import { PageHeader } from "../components/system/page-header.js";
import { PlanBadge } from "../components/system/plan-badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { getBillingSummary, listOrganizationInvites, listOrganizationMembers, listProjects, type BillingSummaryRecord } from "../lib/api.js";
import { useSession } from "../lib/session.js";

interface OrganizationMembershipSummary {
  members: number;
  invites: number;
}

export function OrganizationOverviewPage(): JSX.Element {
  const { session } = useSession();
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [membershipSummary, setMembershipSummary] = useState<OrganizationMembershipSummary | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummaryRecord | null>(null);
  const [isMembersForbidden, setIsMembersForbidden] = useState(session?.role !== "owner");
  const [isBillingForbidden, setIsBillingForbidden] = useState(session?.role !== "owner");

  useEffect(() => {
    let isCancelled = false;

    setProjectCount(null);
    setMembershipSummary(null);
    setBillingSummary(null);
    setIsMembersForbidden(session?.role !== "owner");
    setIsBillingForbidden(session?.role !== "owner");

    void (async () => {
      const projects = await listProjects();

      if (!isCancelled) {
        setProjectCount(projects.length);
      }
    })();

    if (session?.role === "owner") {
      void (async () => {
        try {
          const [members, invites] = await Promise.all([listOrganizationMembers(), listOrganizationInvites()]);

          if (!isCancelled) {
            setMembershipSummary({
              members: members.length,
              invites: invites.length
            });
          }
        } catch (error) {
          if (error instanceof Error && error.message === "forbidden") {
            if (!isCancelled) {
              setIsMembersForbidden(true);
            }

            return;
          }

          throw error;
        }
      })();

      void (async () => {
        try {
          const billing = await getBillingSummary();

          if (!isCancelled) {
            setBillingSummary(billing);
          }
        } catch (error) {
          if (error instanceof Error && error.message === "forbidden") {
            if (!isCancelled) {
              setIsBillingForbidden(true);
            }

            return;
          }

          throw error;
        }
      })();
    }

    return () => {
      isCancelled = true;
    };
  }, [session?.role]);

  if (session === null) {
    return <></>;
  }

  const projectSummaryText = formatActiveProjects(projectCount);
  const roleLabel = session.role === "owner" ? "Owner" : "Member";

  return (
    <div className="space-y-8">
      <PageHeader
        description="Review organization identity, access scope, and the main handoff points into member and billing management from the signed-in workspace."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Organization identity</CardTitle>
            <CardDescription>Current browser-session organization context and access scope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">Organization id</p>
              <p className="font-medium">{session.organization_id}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Current role</p>
              <p className="font-medium">{roleLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Signed-in account</p>
              <p className="font-medium">{session.email}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project inventory</CardTitle>
            <CardDescription>Organization-wide project footprint available from the browser workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {projectSummaryText === null ? <Skeleton className="h-6 w-32" /> : <p className="text-sm font-medium">{projectSummaryText}</p>}
            <Button asChild variant="outline">
              <Link to="/projects">
                <FolderKanbanIcon data-icon="inline-start" />
                Open project inventory
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access scope</CardTitle>
            <CardDescription>Organization management surfaces currently available to this signed-in role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="size-4 text-muted-foreground" />
              <p>{session.role === "owner" ? "Owner management routes are available." : "Project and token routes remain available."}</p>
            </div>
            <div className="flex items-center gap-3">
              <UsersRoundIcon className="size-4 text-muted-foreground" />
              <p>{session.role === "owner" ? "Organization membership controls are enabled." : "Organization member management stays owner-scoped."}</p>
            </div>
            <div className="flex items-center gap-3">
              <CreditCardIcon className="size-4 text-muted-foreground" />
              <p>{session.role === "owner" ? "Billing management remains available from the browser session." : "Billing changes remain owner-scoped."}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {isMembersForbidden ? (
          <CalloutCard
            eyebrow="Owner scope"
            title="Owner permissions are required to manage organization members"
            description="Member-role callers can still review organization identity and move through project and token surfaces, but membership management stays owner-scoped."
            tone="warning"
          />
        ) : (
          <CalloutCard
            eyebrow="Members"
            title="Member management"
            description={formatMembershipSummary(membershipSummary)}
            tone="neutral"
          >
            <Button asChild variant="outline">
              <Link to="/organization/members">
                <UsersRoundIcon data-icon="inline-start" />
                Open member management
              </Link>
            </Button>
          </CalloutCard>
        )}

        {isBillingForbidden ? (
          <CalloutCard
            eyebrow="Owner scope"
            title="Owner permissions are required to manage billing"
            description="Billing remains an owner-only browser-session surface even though the shared organization summary is visible here."
            tone="warning"
          />
        ) : (
          <CalloutCard
            eyebrow="Billing"
            title="Billing management"
            description={formatBillingSummary(billingSummary)}
            tone="neutral"
          >
            {billingSummary === null ? null : <PlanBadge plan={billingSummary.plan} />}
            <Button asChild variant="outline">
              <Link to="/billing">
                <CreditCardIcon data-icon="inline-start" />
                Open billing management
              </Link>
            </Button>
          </CalloutCard>
        )}
      </div>
    </div>
  );
}

function formatActiveProjects(projectCount: number | null): string | null {
  if (projectCount === null) {
    return null;
  }

  return `${projectCount} active ${projectCount === 1 ? "project" : "projects"}`;
}

function formatMembershipSummary(summary: OrganizationMembershipSummary | null): string {
  if (summary === null) {
    return "Loading organization membership summary...";
  }

  return `${summary.members} ${summary.members === 1 ? "member" : "members"} and ${summary.invites} pending ${summary.invites === 1 ? "invite" : "invites"}.`;
}

function formatBillingSummary(summary: BillingSummaryRecord | null): string {
  if (summary === null) {
    return "Loading billing summary...";
  }

  return `${summary.plan} plan with ${formatActiveProjects(summary.active_projects)} and ${formatAllowanceUnits(summary.capacity_units.total)}.`;
}

function formatAllowanceUnits(unitCount: number): string {
  return `${unitCount} allowance ${unitCount === 1 ? "unit" : "units"}`;
}