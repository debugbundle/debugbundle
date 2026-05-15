import { buildApiUrl, buildBrowserSessionHeaders } from "./api.js";

export interface ProjectMemberRecord {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  membership_type: "owner" | "collaborator";
  created_at: string;
  avatar_url: string | null;
}

export interface ProjectInviteRecord {
  invite_id: string;
  project_id: string;
  email: string;
  role: "admin" | "member";
  invited_by_user_id: string;
  accepted_at: string | null;
  canceled_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface AcceptedProjectInviteRecord {
  project_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  membership_type?: "owner" | "collaborator";
}

async function readProjectSharingJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;

    if (response.status === 401 && body?.error === "invalid_session") {
      throw new Error("invalid_session");
    }

    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }

  return (await response.json()) as T;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMemberRecord[]> {
  const body = await readProjectSharingJson<{ members: ProjectMemberRecord[] }>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/members`), {
      credentials: "include"
    })
  );

  return body.members;
}

export async function listProjectInvites(projectId: string): Promise<ProjectInviteRecord[]> {
  const body = await readProjectSharingJson<{ invites: ProjectInviteRecord[] }>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/invites`), {
      credentials: "include"
    })
  );

  return body.invites;
}

export async function inviteProjectMember(
  projectId: string,
  payload: { email: string; role: "admin" | "member" }
): Promise<ProjectInviteRecord> {
  const body = await readProjectSharingJson<{ invite: ProjectInviteRecord }>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/invite`), {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify(payload)
    })
  );

  return body.invite;
}

export async function updateProjectMemberRole(
  projectId: string,
  userId: string,
  role: "admin" | "member"
): Promise<ProjectMemberRecord> {
  const body = await readProjectSharingJson<{ member: ProjectMemberRecord }>(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/members/${userId}`), {
      method: "PATCH",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ role })
    })
  );

  return body.member;
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await readProjectSharingJson(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/members/${userId}`), {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
}

export async function cancelProjectInvite(projectId: string, inviteId: string): Promise<void> {
  await readProjectSharingJson(
    await fetch(buildApiUrl(`/v1/projects/${projectId}/invites/${inviteId}`), {
      method: "DELETE",
      credentials: "include",
      headers: buildBrowserSessionHeaders()
    })
  );
}

export async function acceptProjectInvite(token: string): Promise<AcceptedProjectInviteRecord> {
  const body = await readProjectSharingJson<{ membership: AcceptedProjectInviteRecord }>(
    await fetch(buildApiUrl("/v1/auth/project-invite/accept"), {
      method: "POST",
      credentials: "include",
      headers: buildBrowserSessionHeaders(true),
      body: JSON.stringify({ token })
    })
  );

  return body.membership;
}
