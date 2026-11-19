export function buildAccountAvatarUrl(): string {
  return "/v1/account/avatar";
}

export function buildProjectMemberAvatarUrl(projectId: string, userId: string): string {
  return `/v1/projects/${projectId}/members/${userId}/avatar`;
}

export function buildOrganizationPersonAvatarUrl(organizationId: string, userId: string): string {
  return `/v1/organizations/${organizationId}/people/${userId}/avatar`;
}
