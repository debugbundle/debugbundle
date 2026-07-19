import { Link } from "react-router-dom";

export function BoundedTableTitle({
  title,
  to,
  rowInteractive = false
}: {
  title: string;
  to?: string;
  rowInteractive?: boolean;
}): JSX.Element {
  const className =
    "line-clamp-2 whitespace-normal [overflow-wrap:anywhere] font-medium text-foreground";

  if (to === undefined) {
    return (
      <span className={className} title={title}>
        {title}
      </span>
    );
  }

  return (
    <Link
      to={to}
      className="line-clamp-2 whitespace-normal [overflow-wrap:anywhere] font-medium text-foreground hover:underline"
      title={title}
      data-row-interactive={rowInteractive ? "true" : undefined}
    >
      {title}
    </Link>
  );
}
