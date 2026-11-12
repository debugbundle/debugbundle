/** Unknown totals stay unlabelled rather than presenting a partial page as the inventory. */
export function inventoryTitle(label: string, count: number | null): string {
  return count === null ? label : `${label} (${count.toLocaleString()})`;
}
