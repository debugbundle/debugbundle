import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.js";
import { resolveApiResourceUrl } from "../../lib/api.js";

interface UserAvatarProps {
  email: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  size?: "default" | "sm" | "lg";
}

export function UserAvatar({
  email,
  avatarUrl = null,
  className,
  fallbackClassName,
  size = "default"
}: UserAvatarProps): JSX.Element {
  const resolvedAvatarUrl = resolveApiResourceUrl(avatarUrl);
  const initials = email
    .split("@")[0]
    ?.slice(0, 2)
    .toUpperCase() ?? "DB";

  return (
    <Avatar className={className} size={size}>
      {resolvedAvatarUrl === null ? null : <AvatarImage src={resolvedAvatarUrl} alt="" />}
      <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
    </Avatar>
  );
}
