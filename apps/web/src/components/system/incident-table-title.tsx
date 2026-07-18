import { Link } from "react-router-dom";

export function IncidentTableTitle({
  title,
  to,
  rowInteractive = false
}: {
  title: string;
  to: string;
  rowInteractive?: boolean;
}): JSX.Element {
  return (
    <Link
      to={to}
      className="line-clamp-2 [overflow-wrap:anywhere] font-medium text-foreground hover:underline"
      title={title}
      data-row-interactive={rowInteractive ? "true" : undefined}
    >
      {title}
    </Link>
  );
}
