import {
  buildApiUrl,
  buildBrowserSessionHeaders,
  readJson as readSlackJson
} from "./api-client.js";

export interface SlackDestinationRecord {
  slack_destination_id: string;
  organization_id: string;
  slack_team_id: string;
  slack_team_name: string | null;
  slack_channel_id: string;
  slack_channel_name: string | null;
  installed_by_member_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getSlackInstallUrl(projectId: string, returnTo: string): Promise<string> {
  const searchParams = new URLSearchParams({
    project_id: projectId,
    return_to: returnTo
  });

  const body = await readSlackJson<{ install_url: string }>(
    await fetch(buildApiUrl(`/v1/slack/app/install-url?${searchParams.toString()}`), {
      credentials: "include"
    })
  );

  return body.install_url;
}

export async function listProjectSlackDestinations(
  projectId: string
): Promise<SlackDestinationRecord[]> {
  const body = await readSlackJson<{ destinations: SlackDestinationRecord[] }>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/slack/destinations`), {
      credentials: "include"
    })
  );

  return body.destinations;
}

export async function testProjectSlackDestination(
  projectId: string,
  destinationId: string
): Promise<void> {
  await readSlackJson<{ delivered: true }>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/slack/destinations/${destinationId}/test`), {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
}

export async function deleteProjectSlackDestination(
  projectId: string,
  destinationId: string
): Promise<void> {
  const response = await fetch(
    buildApiUrl(`/v1/projects/${projectId}/slack/destinations/${destinationId}`),
    {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    }
  );

  if (!response.ok) {
    await readSlackJson(response);
  }
}
