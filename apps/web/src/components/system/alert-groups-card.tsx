import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AlertGroupListResponse,
  AlertGroupResponse
} from "../../../../../packages/alert-client/src/index.js";
import { getAlertGroup, listAlertGroups } from "../../lib/api-alert-groups.js";
import { BoundedListLimit } from "./bounded-list-limit.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Notice } from "../ui/notice.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from "../ui/pagination.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";

type Group = AlertGroupListResponse["groups"][number];
export function AlertGroupsCard({ projectId }: { projectId: string }): JSX.Element {
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<Group | null>(null);
  const [groups, setGroups] = useState<AlertGroupListResponse | null>(null);
  const [detail, setDetail] = useState<AlertGroupResponse | null>(null);
  const [groupCursors, setGroupCursors] = useState<Array<string | undefined>>([undefined]);
  const [memberCursors, setMemberCursors] = useState<Array<string | undefined>>([undefined]);
  const [groupPage, setGroupPage] = useState(0);
  const [memberPage, setMemberPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setSelected(null);
    setGroups(null);
    setDetail(null);
    setGroupCursors([undefined]);
    setMemberCursors([undefined]);
    setGroupPage(0);
    setMemberPage(0);
  }, [projectId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    const read =
      selected === null
        ? listAlertGroups(projectId, groupCursors[groupPage], limit)
        : getAlertGroup(
            projectId,
            selected.kind,
            selected.group_id,
            memberCursors[memberPage],
            limit
          );
    void read.then(
      (result) => {
        if (!active) return;
        if ("groups" in result) setGroups(result);
        else setDetail(result);
        setLoading(false);
      },
      () => {
        if (active) {
          setLoading(false);
          setError(true);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [projectId, selected, groupCursors, memberCursors, groupPage, memberPage, revision, limit]);
  const next = selected === null ? groups?.next_cursor : detail?.next_cursor;
  const page = selected === null ? groupPage : memberPage;
  const label = selected === null ? "groups" : "members";
  function nextPage(): void {
    if (next == null || loading || error) return;
    if (selected === null) {
      setGroupCursors((current) => [...current.slice(0, groupPage + 1), next]);
      setGroupPage((current) => current + 1);
    } else {
      setMemberCursors((current) => [...current.slice(0, memberPage + 1), next]);
      setMemberPage((current) => current + 1);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Grouped deliveries</CardTitle>
        <CardDescription>
          Inspect grouped incident notifications and email digests without destination secrets.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <BoundedListLimit
          id="alert-group-limit"
          label="Grouped delivery page limit"
          value={limit}
          paginated
          disabled={loading}
          onChange={(value) => {
            setLimit(value);
            setGroupCursors([undefined]);
            setMemberCursors([undefined]);
            setGroupPage(0);
            setMemberPage(0);
          }}
        />
        {selected === null ? null : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelected(null);
                setDetail(null);
              }}
            >
              Back to groups
            </Button>
            <p className="text-sm text-muted-foreground">
              {selected.kind}: {selected.group_id}
            </p>
          </>
        )}
        {error ? (
          <Notice title="Could not load grouped deliveries" tone="destructive">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((current) => current + 1)}
            >
              Retry grouped deliveries
            </Button>
          </Notice>
        ) : loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading grouped deliveries...
          </p>
        ) : selected === null ? (
          groups?.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No grouped deliveries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups?.groups.map((group) => (
                  <TableRow key={`${group.kind}:${group.group_id}`}>
                    <TableCell>{group.kind}</TableCell>
                    <TableCell>{group.channel}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          group.status === "delivered"
                            ? "success"
                            : group.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {group.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{group.member_count}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Inspect group ${group.group_id}`}
                        onClick={() => {
                          setSelected(group);
                          setDetail(null);
                          setMemberPage(0);
                          setMemberCursors([undefined]);
                        }}
                      >
                        Inspect group
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {detail?.group.member_count} members · {detail?.group.status}
            </p>
            {detail?.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members on this page.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incident</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail?.members.map((member) => (
                    <TableRow key={`${member.incident_id}:${member.created_at}`}>
                      <TableCell>
                        <Link to={`/incidents/${member.incident_id}`}>{member.incident_id}</Link>
                      </TableCell>
                      <TableCell>{member.condition_type}</TableCell>
                      <TableCell>{member.created_at}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
        {page > 0 || next != null ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">Page {page + 1}</p>
            <Pagination className="mx-0 ml-auto w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-label={`Previous ${label}`}
                    disabled={page === 0 || loading}
                    onClick={() =>
                      selected === null
                        ? setGroupPage((current) => current - 1)
                        : setMemberPage((current) => current - 1)
                    }
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    aria-label={`Next ${label}`}
                    disabled={next == null || loading || error}
                    onClick={nextPage}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
