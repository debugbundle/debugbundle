import { MailIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { CalloutCard } from "../components/system/callout-card.js";
import { PageHeader } from "../components/system/page-header.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Notice } from "../components/ui/notice.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { useSession } from "../lib/session.js";
import { SYSTEM_EMAIL_REVIEW_ENTRIES, type SystemEmailReviewEntry } from "../lib/system-email-previews.js";

function formatCategory(category: SystemEmailReviewEntry["category"]): string {
  switch (category) {
    case "auth":
      return "Auth";
    case "billing":
      return "Billing";
    case "operational":
      return "Operational";
    case "alerts":
      return "Alerts";
  }
}

function renderPreviewDocument(html: string): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "<style>",
    "body { margin: 0; padding: 24px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #ffffff; line-height: 1.5; }",
    "h1, h2, h3 { margin: 0 0 12px; color: #111827; }",
    "p, ul, ol { margin: 0 0 12px; }",
    "ul, ol { padding-left: 20px; }",
    "a { color: #2563eb; text-decoration: underline; }",
    "strong { font-weight: 600; }",
    "</style>",
    "</head>",
    `<body>${html}</body>`,
    "</html>"
  ].join("");
}

function SummaryCard({
  title,
  value,
  description
}: {
  title: string;
  value: string;
  description: string;
}): JSX.Element {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value
}: {
  label: string;
  value: string | JSX.Element;
}): JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export function SystemEmailReviewPage(): JSX.Element {
  const { session } = useSession();
  const [selectedId, setSelectedId] = useState(SYSTEM_EMAIL_REVIEW_ENTRIES[0]?.id ?? "");

  const selectedEntry = useMemo(
    () => SYSTEM_EMAIL_REVIEW_ENTRIES.find((entry) => entry.id === selectedId) ?? SYSTEM_EMAIL_REVIEW_ENTRIES[0] ?? null,
    [selectedId]
  );
  const selectedEntryId = selectedEntry?.id ?? "";

  const implementedCount = SYSTEM_EMAIL_REVIEW_ENTRIES.filter((entry) => entry.implementationStatus === "implemented").length;
  const missingRequiredCount = SYSTEM_EMAIL_REVIEW_ENTRIES.filter(
    (entry) => entry.requiredInV1 && entry.implementationStatus === "missing"
  ).length;
  const configurableCount = SYSTEM_EMAIL_REVIEW_ENTRIES.filter((entry) => entry.category === "alerts").length;

  if (session?.role !== "owner") {
    return (
      <CalloutCard
        eyebrow="Owner access"
        title="This local review page is restricted to owners"
        description="System email review is intentionally limited to owner sessions because it aggregates account, billing, and operational copy in one place."
        tone="warning"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border bg-muted/40 p-2.5">
            <MailIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">System emails</h1>
            </div>
            <PageHeader description="Local-only review surface for every email DebugBundle currently sends, including required lifecycle emails." />
          </div>
        </div>

        <Notice title="Local review only" tone="info">
          This route is intentionally hidden from primary navigation and only available in local dev or test builds at <code>/__dev/system-emails</code>.
        </Notice>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Implemented previews"
          value={implementedCount.toString()}
          description="Rendered from the real email package with fixed sample inputs."
        />
        <SummaryCard
          title="Missing required emails"
          value={missingRequiredCount.toString()}
          description="Required by spec/system-emails.md but not yet implemented in packages/email."
        />
        <SummaryCard
          title="Configurable alert emails"
          value={configurableCount.toString()}
          description="User-configured email alert variants, including digest batching."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Email inventory</CardTitle>
            <CardDescription>Scan current coverage, select an email, and inspect the rendered copy and HTML preview.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[96px] text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SYSTEM_EMAIL_REVIEW_ENTRIES.map((entry) => {
                  const isSelected = entry.id === selectedEntryId;

                  return (
                    <TableRow key={entry.id} data-state={isSelected ? "selected" : undefined}>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <div className="font-medium">{entry.title}</div>
                          <p className="text-sm text-muted-foreground">{entry.trigger}</p>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline">{formatCategory(entry.category)}</Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={entry.implementationStatus === "implemented" ? "success" : "warning"}>
                            {entry.implementationStatus === "implemented" ? "Implemented" : "Missing"}
                          </Badge>
                          {entry.requiredInV1 ? <Badge variant="secondary">Required</Badge> : <Badge variant="outline">Configurable</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <Button
                          type="button"
                          variant={isSelected ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setSelectedId(entry.id)}
                        >
                          {isSelected ? "Viewing" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {selectedEntry === null ? null : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatCategory(selectedEntry.category)}</Badge>
                <Badge variant={selectedEntry.implementationStatus === "implemented" ? "success" : "warning"}>
                  {selectedEntry.implementationStatus === "implemented" ? "Implemented" : "Missing"}
                </Badge>
                {selectedEntry.requiredInV1 ? <Badge variant="secondary">Required in v1</Badge> : <Badge variant="outline">User-configured</Badge>}
              </div>
              <CardTitle>{selectedEntry.title}</CardTitle>
              <CardDescription>{selectedEntry.trigger}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Recipient" value={selectedEntry.recipient} />
                <DetailRow label="Category" value={formatCategory(selectedEntry.category)} />
              </div>

              {selectedEntry.notes === undefined ? null : (
                <Notice title={selectedEntry.implementationStatus === "implemented" ? "Context" : "Gap"} tone={selectedEntry.implementationStatus === "implemented" ? "info" : "warning"}>
                  {selectedEntry.notes}
                </Notice>
              )}

              {selectedEntry.preview === undefined ? (
                <Notice title="Preview unavailable" tone="warning">
                  This email is tracked in the spec, but there is no renderer to preview yet.
                </Notice>
              ) : (
                <>
                  <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subject</p>
                    <p className="text-sm font-medium text-foreground">{selectedEntry.preview.subject}</p>
                  </div>

                  <Tabs defaultValue="html">
                    <TabsList>
                      <TabsTrigger value="html">HTML preview</TabsTrigger>
                      <TabsTrigger value="text">Plain text</TabsTrigger>
                      <TabsTrigger value="source">HTML source</TabsTrigger>
                    </TabsList>
                    <TabsContent value="html">
                      <iframe
                        title={`${selectedEntry.title} HTML preview`}
                        srcDoc={renderPreviewDocument(selectedEntry.preview.html)}
                        className="min-h-[460px] w-full rounded-lg border bg-background"
                        sandbox=""
                      />
                    </TabsContent>
                    <TabsContent value="text">
                      <pre className="min-h-[460px] overflow-x-auto rounded-lg border bg-muted/20 p-4 text-sm leading-6 whitespace-pre-wrap">
                        {selectedEntry.preview.text}
                      </pre>
                    </TabsContent>
                    <TabsContent value="source">
                      <pre className="min-h-[460px] overflow-x-auto rounded-lg border bg-muted/20 p-4 text-sm leading-6 whitespace-pre-wrap">
                        {selectedEntry.preview.html}
                      </pre>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
