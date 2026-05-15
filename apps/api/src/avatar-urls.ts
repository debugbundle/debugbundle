export function buildAccountAvatarUrl(): string {
  return "/v1/account/avatar";
}

export function buildProjectMemberAvatarUrl(projectId: string, userId: string): string {
  return `/v1/projects/${projectId}/members/${userId}/avatar`;
}
