import { CreditCardIcon, FolderKanbanIcon, ShieldCheckIcon, UsersRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { CalloutCard } from "../components/system/callout-card.js";
import { PageHeader } from "../components/system/page-header.js";
import { PlanBadge } from "../components/system/plan-badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { getBillingSummary, isInvalidSessionError, listProjects, type BillingSummaryRecord, type ProjectRecord } from "../lib/api.js";
import { isSharedProject } from "../lib/project-access.js";
import { useSession } from "../lib/session.js";

export function OrganizationOverviewPage(): JSX.Element {
  const { session } = useSession();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummaryRecord | null>(null);
  const [isBillingForbidden, setIsBillingForbidden] = useState(session?.role !== "owner");

  useEffect(() => {
    let isCancelled = false;

    setProjects(null);
    setBillingSummary(null);
    setIsBillingForbidden(session?.role !== "owner");

    void (async () => {
      try {
        const nextProjects = await listProjects();

        if (!isCancelled) {
          setProjects(nextProjects);
        }
      } catch (error) {
        if (isInvalidSessionError(error)) {
          return;
        }

        throw error;
      }
    })();

    if (session?.role === "owner") {
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

          if (isInvalidSessionError(error)) {
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

  const projectSummaryText = formatActiveProjects(projects?.length ?? null);
  const roleLabel = session.role === "owner" ? "Owner" : "Member";

  return (
    <div className="space-y-8">
      <PageHeader description="Review organization details, project access, and billing." />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Organization identity</CardTitle>
            <CardDescription>Organization details for this signed-in session.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">Organization ID</p>
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
            <CardDescription>Projects currently available in this organization.</CardDescription>
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
            <CardDescription>What this signed-in role can manage across the workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="size-4 text-muted-foreground" />
              <p>{session.role === "owner" ? "Owner controls are available." : "Project and token routes are available."}</p>
            </div>
            <div className="flex items-center gap-3">
              <UsersRoundIcon className="size-4 text-muted-foreground" />
              <p>{session.role === "owner" ? "Project sharing is managed from each project." : "Shared projects appear in the project inventory."}</p>
            </div>
            <div className="flex items-center gap-3">
              <CreditCardIcon className="size-4 text-muted-foreground" />
              <p>{session.role === "owner" ? "Billing management is available." : "Billing changes are owner-only."}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CalloutCard
          eyebrow="Project sharing"
          title="Manage sharing from each project"
          description={formatProjectSharingSummary(projects)}
          tone="neutral"
        >
          <Button asChild variant="outline">
            <Link to="/projects">
              <UsersRoundIcon data-icon="inline-start" />
              Open projects
            </Link>
          </Button>
        </CalloutCard>

        {isBillingForbidden ? (
          <CalloutCard
            eyebrow="Owner scope"
            title="Owner permissions are required to manage billing"
            description="Billing stays owner-only, even though this shared summary is visible here."
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

export function formatActiveProjects(projectCount: number | null): string | null {
  if (projectCount === null) {
    return null;
  }

  return `${projectCount} active ${projectCount === 1 ? "project" : "projects"}`;
}

export function formatProjectSharingSummary(projects: ProjectRecord[] | null): string {
  if (projects === null) {
    return "Loading sharing summary...";
  }

  if (projects.length === 0) {
    return "Create a project to start sending events and sharing access.";
  }

  const sharedCount = projects.filter((project) => isSharedProject(project)).length;
  const projectSummary = formatActiveProjects(projects.length);

  if (sharedCount === 0) {
    return `${projectSummary}. Sharing is managed from each project's Members tab.`;
  }

  return `${projectSummary}. ${sharedCount} ${sharedCount === 1 ? "project is" : "projects are"} shared.`;
}

export function formatBillingSummary(summary: BillingSummaryRecord | null): string {
  if (summary === null) {
    return "Loading billing summary...";
  }

  return `${summary.plan} plan with ${formatActiveProjects(summary.active_projects)} and ${formatAllowanceUnits(summary.capacity_units.total)}.`;
}

export function formatAllowanceUnits(unitCount: number): string {
  return `${unitCount} allowance ${unitCount === 1 ? "unit" : "units"}`;
}
