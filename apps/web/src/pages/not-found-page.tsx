import { FileSearchIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../components/ui/button.js";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "../components/ui/empty.js";

export function NotFoundPage(): JSX.Element {
  return (
    <Empty className="min-h-[50vh] rounded-2xl border border-dashed bg-card/40">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileSearchIcon />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          This route is unavailable or does not exist in the current workspace.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild type="button" variant="outline">
          <Link to="/">Go back</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
