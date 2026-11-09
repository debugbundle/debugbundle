import { lazy, Suspense } from "react";

const Preview = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("../../dev/billing-preview-controls.js");
      return { default: module.BillingPreviewControls };
    })
  : null;

/** Vite strips the simulator import from production builds. */
export function LocalBillingPreview(): JSX.Element | null {
  if (!import.meta.env.DEV || import.meta.env.VITE_DEBUGBUNDLE_DEV_MOCK !== "true" || !Preview)
    return null;
  return (
    <Suspense fallback={<p role="status">Loading local billing preview…</p>}>
      <Preview />
    </Suspense>
  );
}
