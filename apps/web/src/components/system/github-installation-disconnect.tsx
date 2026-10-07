import { useEffect, useRef, useState } from "react";
import { disconnectGitHubInstallation } from "../../lib/api.js";
import { ResourceDeleteDialog } from "./resource-delete-dialog.js";
import { Notice } from "../ui/notice.js";

export function GitHubInstallationDisconnect({
  accountLogin,
  onDisconnected
}: {
  accountLogin: string;
  onDisconnected: () => void;
}): JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function disconnect(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await disconnectGitHubInstallation();
      if (active.current) onDisconnected();
    } catch {
      if (active.current) setError(true);
    } finally {
      if (active.current) setPending(false);
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <ResourceDeleteDialog
        label="Disconnect GitHub installation"
        disabled={pending}
        description={`Disconnect ${accountLogin} from this organization? This removes repository assignments for all its projects and stops dispatches. The App remains installed on GitHub.`}
        onConfirm={() => void disconnect()}
      />
      {error ? (
        <Notice tone="destructive" title="GitHub disconnect failed">
          The installation could not be disconnected. Try again.
        </Notice>
      ) : null}
    </div>
  );
}
