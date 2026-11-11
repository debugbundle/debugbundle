/** Decorative metadata punctuation with consistent spacing on both sides. */
export function MetadataSeparator(): JSX.Element {
  return (
    <span aria-hidden="true" className="mx-2 font-normal text-muted-foreground">
      {" · "}
    </span>
  );
}
