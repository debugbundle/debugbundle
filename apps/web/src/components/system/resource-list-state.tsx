import type { ReactNode } from "react";

import { useDelayedVisibility } from "../../lib/use-delayed-visibility.js";

interface ResourceListStateProps<TItem> {
  items: TItem[] | null;
  loading: ReactNode;
  empty: ReactNode;
  children: (items: TItem[]) => ReactNode;
}

export function ResourceListState<TItem>({ items, loading, empty, children }: ResourceListStateProps<TItem>): JSX.Element {
  const showLoading = useDelayedVisibility(items === null);

  if (items === null) {
    return showLoading ? <>{loading}</> : <></>;
  }

  if (items.length === 0) {
    return <>{empty}</>;
  }

  return <>{children(items)}</>;
}