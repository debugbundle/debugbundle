import type { ReactNode } from "react";

interface ResourceListStateProps<TItem> {
  items: TItem[] | null;
  loading: ReactNode;
  empty: ReactNode;
  children: (items: TItem[]) => ReactNode;
}

export function ResourceListState<TItem>({ items, loading, empty, children }: ResourceListStateProps<TItem>): JSX.Element {
  if (items === null) {
    return <>{loading}</>;
  }

  if (items.length === 0) {
    return <>{empty}</>;
  }

  return <>{children(items)}</>;
}