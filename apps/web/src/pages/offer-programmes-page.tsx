import { OfferPerformanceReport } from "../components/system/offer-performance-report.js";
import { OfferOperatorInventory } from "../components/system/offer-operator-inventory.js";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ProgrammeVersion } from "../../../../packages/referrals/src/programme-policy.js";
import { offerApi, offerErrorMessage } from "../lib/offer-api.js";
import { getOfferOperatorAccess } from "../lib/offer-operator-api.js";
import { ApiRequestError } from "../lib/api-client.js";
import { useSession } from "../lib/session.js";
import { OfferApiError } from "../../../../packages/referral-client/src/offer-api.js";
import { PageHeader } from "../components/system/page-header.js";
import { OperatorEmailGate } from "../components/system/operator-email-gate.js";
import { OfferProgrammeEditor } from "../components/system/offer-programme-editor.js";
import { OfferProgrammeGroup } from "../components/system/offer-programme-group.js";
import { OfferProgrammeDetails } from "../components/system/offer-programme-details.js";
import { OfferOperatorTools } from "../components/system/offer-operator-tools.js";
import { Button } from "../components/ui/button.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs.js";

export function OfferProgrammesPage(): JSX.Element {
  const { session, setSession } = useSession(),
    navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "email_auth_required" | "error">(
      "loading"
    ),
    [versions, setVersions] = useState<ProgrammeVersion[]>([]),
    [editor, setEditor] = useState<ProgrammeVersion | null | undefined>(undefined),
    [revision, setRevision] = useState(0),
    [more, setMore] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [claimsEnabled, setClaimsEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState("programmes");
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setStatus("loading");
    setEditor(undefined);
    setError(null);
    void (async () => {
      try {
        const access = await getOfferOperatorAccess();
        if (current !== generation.current) return;
        if (access.status === "email_auth_required") {
          setStatus("email_auth_required");
          return;
        }
        const [result, capabilities] = await Promise.all([
          offerApi.execute("operator_programmes", { limit: 25 }),
          offerApi.execute("capabilities", {})
        ]);
        if (current !== generation.current) return;
        setClaimsEnabled(capabilities.enabled);
        setVersions(result.programmes);
        setMore(result.programmes.length === 25);
        setStatus("ready");
      } catch (reason) {
        if (current !== generation.current) return;
        if (
          (reason instanceof ApiRequestError || reason instanceof OfferApiError) &&
          reason.status === 404
        ) {
          void navigate("/", { replace: true });
          return;
        }
        setStatus("error");
      }
    })();
    return () => {
      generation.current++;
    };
  }, [session?.user_id, session?.organization_id, revision, navigate]);
  const reload = (): void => setRevision((value) => value + 1);
  const groups = new Map<string, ProgrammeVersion[]>();
  for (const version of versions) {
    const group = groups.get(version.programme_id) ?? [];
    group.push(version);
    groups.set(version.programme_id, group);
  }
  const currentGroups = [...groups.values()].filter((group) =>
    group.some((v) => v.state !== "ended")
  );
  const archivedGroups = [...groups.values()].filter((group) =>
    group.every((v) => v.state === "ended")
  );
  const programmeGroup = (group: ProgrammeVersion[]): JSX.Element => (
    <OfferProgrammeGroup
      key={group[0]!.programme_id}
      versions={group}
      claimsEnabled={claimsEnabled}
      onRevise={setEditor}
      onChanged={reload}
    />
  );
  const loadMore = async (): Promise<void> => {
    const last = versions.at(-1);
    if (!last || pending) return;
    const current = generation.current;
    setPending(true);
    setError(null);
    try {
      const result = await offerApi.execute("operator_programmes", {
        limit: 25,
        before: last.version_id
      });
      if (current !== generation.current) return;
      setVersions((previous) => [
        ...previous,
        ...result.programmes.filter(
          (item) => !previous.some((existing) => existing.version_id === item.version_id)
        )
      ]);
      setMore(result.programmes.length === 25);
    } catch (reason) {
      if (current === generation.current) setError(offerErrorMessage(reason));
    } finally {
      if (current === generation.current) setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Define referral agreements and introductory offers. Existing customer promises and earned balances retain their recorded terms."
        actions={
          <Button asChild variant="outline">
            <Link to="/analytics">Internal Analytics</Link>
          </Button>
        }
      />
      {import.meta.env.DEV && import.meta.env.VITE_DEBUGBUNDLE_DEV_MOCK === "true" ? (
        <Notice title="Local programme preview">
          Synthetic data only. Edits reset when the preview restarts. Coupon bindings and activation
          are simulated; no Stripe validation, charges or live campaigns occur.
        </Notice>
      ) : null}
      {status === "loading" ? (
        <Skeleton className="h-40 w-full" />
      ) : status === "email_auth_required" ? (
        <OperatorEmailGate
          resourceLabel="Programmes & offers"
          email={session?.email ?? ""}
          onVerified={(next) => {
            setSession(next);
            reload();
          }}
        />
      ) : status === "error" ? (
        <Notice tone="warning" title="Programmes could not be loaded">
          <Button variant="outline" onClick={reload}>
            Retry
          </Button>
        </Notice>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="programmes">Programmes</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="tools">Codes & access</TabsTrigger>
            </TabsList>
            {activeTab === "programmes" && editor === undefined ? (
              <Button onClick={() => setEditor(null)}>Create programme</Button>
            ) : null}
          </div>
          <TabsContent value="programmes" className="flex flex-col gap-6">
            {!claimsEnabled ? (
              <Notice title="New programme claims are disabled">
                Prepare and review drafts here. Activation becomes available after new programme
                claims are enabled for this environment. Existing saved discounts and financial
                obligations remain available.
              </Notice>
            ) : null}
            {editor !== undefined ? (
              <OfferProgrammeEditor
                key={editor?.version_id ?? "new"}
                source={editor}
                onCancel={() => setEditor(undefined)}
                onSaved={() => {
                  setEditor(undefined);
                  reload();
                }}
              />
            ) : null}
            {!versions.length ? (
              <Notice title="No programmes yet">
                Create a draft, review its terms and claim limit, then explicitly activate it. No
                programme is activated automatically.
              </Notice>
            ) : null}
            {currentGroups.map(programmeGroup)}
            {archivedGroups.length ? (
              <OfferProgrammeDetails label={`Archived programmes (${archivedGroups.length})`}>
                {archivedGroups.map(programmeGroup)}
              </OfferProgrammeDetails>
            ) : null}
            {error ? <Notice tone="warning">{error}</Notice> : null}
            {more ? (
              <div>
                <Button variant="outline" disabled={pending} onClick={() => void loadMore()}>
                  {pending ? "Loading programmes…" : "Load older revisions"}
                </Button>
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="performance">
            <OfferPerformanceReport />
          </TabsContent>
          <TabsContent value="inventory">
            <OfferOperatorInventory />
          </TabsContent>
          <TabsContent value="tools">
            <OfferOperatorTools />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
