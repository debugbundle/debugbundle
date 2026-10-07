import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  createAgentCredential,
  listAgentCredentials,
  revokeAgentCredential,
  type AgentCredential
} from "../../lib/api-agent-tokens.js";
import { ApiRequestError } from "../../lib/api-client.js";
import { showErrorToast, showSuccessToast } from "../../lib/notify.js";
import { DialogFormContent } from "./dialog-form-content.js";
import { PlaintextTokenReveal } from "./plaintext-token-reveal.js";
import { ResourceDeleteDialog } from "./resource-delete-dialog.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card.js";
import { Dialog } from "../ui/dialog.js";
import { Field, FieldGroup, FieldDescription, FieldLabel } from "../ui/field.js";
import { Input } from "../ui/input.js";
import { Notice } from "../ui/notice.js";
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from "../ui/table.js";
export function ProjectAgentCredentialsCard({ projectId }: { projectId: string }): JSX.Element {
  const generation = useRef(0);
  const [tokens, setTokens] = useState<AgentCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  useEffect(() => {
    generation.current += 1;
    setOpen(false);
    setSecret(null);
    setError(null);
    setPending(false);
    return () => {
      generation.current += 1;
    };
  }, [projectId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setTokens([]);
    void listAgentCredentials(projectId).then(
      (result) => {
        if (active) {
          setTokens(result);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setLoadError(true);
          setLoading(false);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [projectId, revision]);
  const expiryValue = expiry.trim();
  const expiryTime = Date.parse(expiryValue);
  const invalidExpiry =
    expiryValue.length > 0 &&
    (!z.string().datetime().safeParse(expiryValue).success ||
      expiryTime <= Date.now() ||
      expiryTime > Date.now() + 90 * 86400000);
  async function create(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || invalidExpiry || label.trim().length === 0) return;
    const requestGeneration = generation.current;
    setPending(true);
    setError(null);
    setSecret(null);
    try {
      const token = await createAgentCredential(projectId, {
        label: label.trim(),
        ...(expiryValue ? { expires_at: expiryValue } : {})
      });
      if (generation.current !== requestGeneration) return;
      const { plaintext, ...record } = token;
      setTokens((current) => [
        record,
        ...current.filter((entry) => entry.token_id !== record.token_id)
      ]);
      setSecret(plaintext ?? null);
      setOpen(false);
      setLabel("");
      setExpiry("");
      showSuccessToast("Agent credential created successfully.");
    } catch (cause) {
      if (generation.current !== requestGeneration) return;
      setError(
        cause instanceof ApiRequestError && cause.code === "agent_token_issuance_unavailable"
          ? "Agent credential creation is unavailable on this server."
          : "Could not create the agent credential."
      );
    } finally {
      if (generation.current === requestGeneration) setPending(false);
    }
  }
  async function revoke(token: AgentCredential): Promise<void> {
    if (pending) return;
    const requestGeneration = generation.current;
    setPending(true);
    try {
      const record = await revokeAgentCredential(projectId, token.token_id);
      if (generation.current !== requestGeneration) return;
      setTokens((current) =>
        current.map((entry) => (entry.token_id === record.token_id ? record : entry))
      );
      setSecret(null);
      showSuccessToast("Agent credential revoked successfully.");
    } catch {
      if (generation.current === requestGeneration)
        showErrorToast("Could not revoke the agent credential.");
    } finally {
      if (generation.current === requestGeneration) setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent credentials</CardTitle>
        <CardDescription>
          Restricted incident evidence for this project. These credentials cannot ingest events or
          manage resources and use the five-tool agent profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          type="button"
          disabled={pending || loading}
          onClick={() => {
            setLabel("");
            setExpiry("");
            setError(null);
            setOpen(true);
          }}
        >
          Create agent credential
        </Button>
        {secret === null ? null : (
          <>
            <PlaintextTokenReveal
              title="New agent credential"
              regionLabel="New agent credential secret"
              value={secret}
            />
            <Button type="button" variant="outline" onClick={() => setSecret(null)}>
              Dismiss agent secret
            </Button>
          </>
        )}
        {loading ? (
          <p role="status">Loading agent credentials...</p>
        ) : loadError ? (
          <Notice tone="warning">
            Could not load agent credentials.{" "}
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry agent credentials
            </Button>
          </Notice>
        ) : tokens.length === 0 ? (
          <Notice>No agent credentials issued for this project.</Notice>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.token_id}>
                  <TableCell>{token.label}</TableCell>
                  <TableCell>{token.scope}</TableCell>
                  <TableCell>{token.expires_at}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {token.revoked_at !== null
                        ? "Revoked"
                        : Date.parse(token.expires_at) <= Date.now()
                          ? "Expired"
                          : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {token.revoked_at === null ? (
                      <ResourceDeleteDialog
                        label="Revoke agent credential"
                        description={`Revoke ${token.label}. Any assistant using this credential will lose incident evidence access for this project.`}
                        disabled={pending}
                        onConfirm={() => void revoke(token)}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogFormContent
            title="Create agent credential"
            description="Creation is available only when enabled by this server. Credentials expire after 30 days by default and at most 90 days."
            onSubmit={(event) => void create(event)}
            footer={
              <Button
                type="submit"
                disabled={pending || invalidExpiry || label.trim().length === 0}
              >
                {pending ? "Creating..." : "Create agent credential"}
              </Button>
            }
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="agent-label">Credential label</FieldLabel>
                <Input
                  id="agent-label"
                  required
                  maxLength={120}
                  value={label}
                  disabled={pending}
                  onChange={(event) => setLabel(event.currentTarget.value)}
                />
              </Field>
              <Field data-invalid={invalidExpiry || undefined}>
                <FieldLabel htmlFor="agent-expiry">Expiry (UTC)</FieldLabel>
                <Input
                  id="agent-expiry"
                  value={expiry}
                  disabled={pending}
                  aria-invalid={invalidExpiry}
                  aria-describedby="agent-expiry-description"
                  placeholder="2026-11-07T10:00:00Z"
                  onChange={(event) => setExpiry(event.currentTarget.value)}
                />
                <FieldDescription id="agent-expiry-description">
                  {invalidExpiry
                    ? "Enter a future ISO 8601 UTC timestamp within 90 days."
                    : "Optional ISO 8601 UTC timestamp. Leave blank for 30 days."}
                </FieldDescription>
              </Field>
              {error === null ? null : <Notice tone="warning">{error}</Notice>}
            </FieldGroup>
          </DialogFormContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
