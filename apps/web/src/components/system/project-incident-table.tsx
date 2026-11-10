import type { MouseEvent } from "react";
import type { IncidentRecord } from "../../lib/api.js";
import { formatIncidentMatchedFields } from "../../lib/incident-copy.js";
import {
  formatDate,
  formatServiceName,
  severityVariantMap,
  statusVariantMap,
  type ProjectIncidentSortField
} from "../../lib/project-presentation.js";
import { Badge } from "../ui/badge.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";
import { BoundedTableTitle } from "./bounded-table-title.js";
import { SortableTableHead, type SortState } from "./sortable-table-head.js";

export function IncidentTable({
  incidents,
  sort,
  onSortChange,
  selectedIncidentIds,
  onToggleIncidentSelection,
  onIncidentRowClick
}: {
  incidents: IncidentRecord[];
  sort: SortState<ProjectIncidentSortField>;
  onSortChange: (field: ProjectIncidentSortField) => void;
  selectedIncidentIds: Set<string>;
  onToggleIncidentSelection: (incidentId: string) => void;
  onIncidentRowClick: (event: MouseEvent<HTMLTableRowElement>, incident: IncidentRecord) => void;
}): JSX.Element {
  return (
    <Table className="min-w-[900px] md:min-w-0 md:table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <span className="sr-only">Select incidents</span>
          </TableHead>
          <SortableTableHead
            label="Incident"
            field="title"
            sort={sort}
            onSortChange={onSortChange}
            className="w-[34%]"
          />
          <SortableTableHead
            label="Service"
            field="service_name"
            sort={sort}
            onSortChange={onSortChange}
            className="w-[16%]"
          />
          <SortableTableHead
            label="Environment"
            field="environment"
            sort={sort}
            onSortChange={onSortChange}
            className="w-[14%]"
          />
          <SortableTableHead
            label="Severity"
            field="severity"
            sort={sort}
            onSortChange={onSortChange}
          />
          <SortableTableHead
            label="Status"
            field="status"
            sort={sort}
            onSortChange={onSortChange}
          />
          <SortableTableHead
            label="Occurrences"
            field="occurrence_count"
            sort={sort}
            onSortChange={onSortChange}
            className="whitespace-nowrap"
          />
          <SortableTableHead
            label="Last seen"
            field="last_seen_at"
            sort={sort}
            onSortChange={onSortChange}
            className="text-right whitespace-nowrap"
            align="right"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {incidents.map((incident) => (
          <TableRow
            key={incident.incident_id}
            className="cursor-pointer"
            data-state={selectedIncidentIds.has(incident.incident_id) ? "selected" : undefined}
            onClick={(event) => {
              onIncidentRowClick(event, incident);
            }}
          >
            <TableCell className="align-middle" data-row-interactive="true">
              <input
                type="checkbox"
                aria-label={`Select incident ${incident.title}`}
                checked={selectedIncidentIds.has(incident.incident_id)}
                onChange={() => {
                  onToggleIncidentSelection(incident.incident_id);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              />
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <BoundedTableTitle
                title={incident.title}
                to={`/projects/${incident.project_id}/incidents/${incident.incident_id}`}
                rowInteractive
              />
              <p className="mt-1 text-xs text-muted-foreground whitespace-normal break-words">
                {formatIncidentMatchedFields(incident.matched_fields)}
              </p>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
              {formatServiceName(incident.service_name)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-normal break-words align-middle">
              {incident.environment}
            </TableCell>
            <TableCell>
              <Badge variant={severityVariantMap[incident.severity]}>{incident.severity}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariantMap[incident.status]}>{incident.status}</Badge>
            </TableCell>
            <TableCell className="whitespace-nowrap">{incident.occurrence_count}</TableCell>
            <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
              {formatDate(incident.last_seen_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
