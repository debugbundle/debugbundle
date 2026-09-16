import type { BundleV1 } from "../../../../../packages/shared-types/src/index.js";
import { Badge } from "../ui/badge.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import { CalloutCard } from "./callout-card.js";

export function BrowserResourceDetails({
  resource
}: {
  resource: NonNullable<BundleV1["context"]["resource_failure"]>;
}): JSX.Element {
  const routes = resource.routes;
  return (
    <CalloutCard
      className="break-words"
      eyebrow="Resource failure"
      title={resource.title}
      description={resource.diagnosis}
      tone="neutral"
    >
      <p className="break-all font-mono text-sm">
        {resource.host ?? ""}
        {resource.path}
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{resource.role.replace(/_/g, " ")}</Badge>
        <Badge variant="outline">
          {resource.first_party === null
            ? "Origin unknown"
            : resource.first_party
              ? "Same origin"
              : "External origin"}
        </Badge>
      </div>
      {resource.optional_candidate ? (
        <p className="text-sm text-muted-foreground">
          This service may be optional for your app. Use Reduce noise to review a rule for this
          resource, service and environment.
        </p>
      ) : null}
      {routes.items.length > 0 ? (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-3/5">Affected route</TableHead>
              <TableHead className="w-2/5 whitespace-normal text-right">
                Recorded occurrences
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.items.map((item) => (
              <TableRow key={item.route}>
                <TableCell className="break-all font-mono">{item.route}</TableCell>
                <TableCell className="text-right tabular-nums">{item.occurrences}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">No affected routes were recorded.</p>
      )}
      <p className="text-xs text-muted-foreground">
        {routes.coverage === "retained_samples"
          ? "Counts reflect retained samples in this bundle."
          : "Counts reflect occurrence metadata at bundle generation, including sampled-out events."}
        {routes.unattributed_occurrences > 0
          ? ` ${routes.unattributed_occurrences} occurrences have no recorded route.`
          : ""}
        {routes.omitted_routes > 0
          ? ` ${routes.omitted_routes} additional ${routes.omitted_routes === 1 ? "route is" : "routes are"} not shown.`
          : ""}
      </p>
    </CalloutCard>
  );
}
