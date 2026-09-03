import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { OpenAiConnectionRecord, OpenAiProductScope } from "../../lib/api-types.js";
import { ApiRequestError } from "../../lib/api.js";
import { listOpenAiConnections, revokeOpenAiConnection } from "../../lib/openai-oauth-api.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../ui/alert-dialog.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Notice } from "../ui/notice.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.js";

const SCOPE_NAMES: Record<OpenAiProductScope, string> = {
  "debugbundle:projects:read": "Projects",
  "debugbundle:incidents:read": "Incidents",
  "debugbundle:artifacts:read": "Artifacts",
  "debugbundle:improvements:read": "Improvements",
  "debugbundle:analytics:read": "Analytics",
  "debugbundle:health:read": "Health"
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function scopeSummary(scopes: OpenAiProductScope[]): string {
  return scopes.length === 0
    ? "Identity only"
    : scopes.map((scope) => SCOPE_NAMES[scope]).join(", ");
}

function StatusBadge({ status }: { status: OpenAiConnectionRecord["status"] }): JSX.Element {
  const variant = status === "active" ? "success" : status === "expired" ? "warning" : "outline";
  return (
    <Badge variant={variant}>
      {status[0]?.toUpperCase()}
      {status.slice(1)}
    </Badge>
  );
}

function RevokeOpenAiConnectionDialog({
  connection,
  isRevoking,
  defaultOpen = false,
  onRevoke
}: {
  connection: OpenAiConnectionRecord;
  isRevoking: boolean;
  defaultOpen?: boolean;
  onRevoke: () => Promise<void>;
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={isRevoking}>
          Revoke access
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {connection.client_name} access?</AlertDialogTitle>
          <AlertDialogDescription>
            This stops ChatGPT and Codex from using this connection. It does not delete DebugBundle
            data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isRevoking}
            onClick={(event) => {
              event.preventDefault();
              void onRevoke().then(() => setIsOpen(false));
            }}
          >
            {isRevoking ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
            Revoke access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function OpenAiConnectionsSection(): JSX.Element | null {
  const [connections, setConnections] = useState<OpenAiConnectionRecord[] | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  async function loadConnections(): Promise<void> {
    try {
      setConnections(await listOpenAiConnections());
      setLoadError(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        setIsUnavailable(true);
        return;
      }
      setLoadError(true);
    }
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  async function handleRevoke(connection: OpenAiConnectionRecord): Promise<void> {
    setRevokingGrantId(connection.grant_id);
    try {
      await revokeOpenAiConnection(connection.grant_id);
      await loadConnections();
      showSuccessToast("OpenAI connection revoked successfully.");
    } catch {
      await loadConnections();
      showErrorToast("Could not revoke the OpenAI connection.");
    } finally {
      setRevokingGrantId(null);
    }
  }

  if (isUnavailable) {
    return null;
  }

  return (
    <OpenAiConnectionsSectionView
      connections={connections}
      loadError={loadError}
      revokingGrantId={revokingGrantId}
      onRevoke={handleRevoke}
    />
  );
}

export interface OpenAiConnectionsSectionViewProps {
  connections: OpenAiConnectionRecord[] | null;
  loadError: boolean;
  revokingGrantId: string | null;
  confirmationGrantId?: string;
  onRevoke: (connection: OpenAiConnectionRecord) => Promise<void>;
}

export function OpenAiConnectionsSectionView({
  connections,
  loadError,
  revokingGrantId,
  confirmationGrantId,
  onRevoke
}: OpenAiConnectionsSectionViewProps): JSX.Element {
  return (
    <section id="openai-connections" aria-labelledby="openai-connections-title">
      <Card>
        <CardHeader>
          <CardTitle id="openai-connections-title">OpenAI connections</CardTitle>
          <CardDescription>
            Review or revoke ChatGPT and Codex access to this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <Notice tone="destructive">
              Could not load OpenAI connections. Refresh the page to try again.
            </Notice>
          ) : connections === null ? (
            <div
              className="flex items-center gap-3 py-4 text-sm text-muted-foreground"
              role="status"
            >
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              Loading OpenAI connections
            </div>
          ) : connections.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No OpenAI connections are active or retained for this organization.
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Connection</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Consent and expiry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connections.map((connection) => (
                      <TableRow key={connection.grant_id}>
                        <TableCell>
                          <p className="font-medium">{connection.client_name}</p>
                          <p className="text-muted-foreground">{connection.organization_name}</p>
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal">
                          {scopeSummary(connection.product_scopes)}
                        </TableCell>
                        <TableCell>
                          <p>{formatDate(connection.consented_at)}</p>
                          <p className="text-muted-foreground">
                            Expires {formatDate(connection.expires_at)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={connection.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {connection.status === "active" ? (
                            <RevokeOpenAiConnectionDialog
                              connection={connection}
                              isRevoking={revokingGrantId === connection.grant_id}
                              defaultOpen={confirmationGrantId === connection.grant_id}
                              onRevoke={() => onRevoke(connection)}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {connections.map((connection) => (
                  <div
                    key={connection.grant_id}
                    className="space-y-3 rounded-lg border bg-background/70 p-4 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{connection.client_name}</p>
                        <p className="text-muted-foreground">{connection.organization_name}</p>
                      </div>
                      <StatusBadge status={connection.status} />
                    </div>
                    <dl className="space-y-2">
                      <div>
                        <dt className="text-muted-foreground">Access</dt>
                        <dd>{scopeSummary(connection.product_scopes)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Consented</dt>
                        <dd>{formatDate(connection.consented_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Expires</dt>
                        <dd>{formatDate(connection.expires_at)}</dd>
                      </div>
                    </dl>
                    {connection.status === "active" ? (
                      <RevokeOpenAiConnectionDialog
                        connection={connection}
                        isRevoking={revokingGrantId === connection.grant_id}
                        onRevoke={() => onRevoke(connection)}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
