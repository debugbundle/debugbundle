import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  PublicStatusIdSchema,
  PublicStatusPageSchema,
  type PublicStatusPage
} from "../../../../packages/shared-types/src/public-status.js";
import { API_BASE } from "../lib/api-client.js";
import { PublicStatusPageView } from "../components/system/public-status-view.js";
import { Notice } from "../components/ui/notice.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { BrandMark } from "../components/system/brand-mark.js";
import { ThemeProvider } from "../lib/theme.js";

export function PublicStatusPage(): JSX.Element {
  return (
    <ThemeProvider forcedTheme="system">
      <PublicStatusPageContent />
    </ThemeProvider>
  );
}

function PublicStatusPageContent(): JSX.Element {
  const { publicId } = useParams();
  const [result, setResult] = useState<{
    id: string | undefined;
    page: PublicStatusPage | null;
    error: boolean;
  } | null>(null);
  const current = result?.id === publicId ? result : null;
  useEffect(() => {
    let canceled = false;
    let controller = new AbortController();
    let inFlight = false;
    async function refresh(): Promise<void> {
      if (canceled) return;
      if (!PublicStatusIdSchema.safeParse(publicId).success) {
        setResult({ id: publicId, page: null, error: true });
        return;
      }
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${API_BASE}/v1/public/status/${publicId}`, {
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("unavailable");
        const page = PublicStatusPageSchema.parse(await response.json());
        if (!canceled) setResult({ id: publicId, page, error: false });
      } catch {
        if (!canceled) setResult({ id: publicId, page: null, error: true });
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 60_000);
    const onVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") return;
      // A suspended tab may have missed unpublishing or an outage. Revalidate before showing it.
      setResult(null);
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      canceled = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [publicId]);
  useEffect(() => {
    const oldTitle = document.title;
    document.title = current?.page?.title ?? "Status page";
    return () => {
      document.title = oldTitle;
    };
  }, [current?.page?.title]);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold">{current?.page?.title ?? "Status page"}</h1>
      {current === null ? (
        <Skeleton className="h-40 w-full" />
      ) : current.error ? (
        <Notice tone="warning" title="Status unavailable">
          This status page is unavailable.
        </Notice>
      ) : current.page ? (
        <>
          <PublicStatusPageView page={current.page} />
          <p className="text-sm text-muted-foreground">
            Availability reflects recorded checks for the published services. Days without verified
            results are excluded from uptime. Unknown or paused status means current availability
            cannot be verified.
          </p>
        </>
      ) : null}
      <footer className="flex flex-col items-center gap-4 py-4 text-center text-sm text-muted-foreground">
        <a
          href="https://debugbundle.com"
          aria-label="DebugBundle"
          className="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2"
        >
          <BrandMark className="size-6" />
        </a>
        <a
          href="https://debugbundle.com"
          className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2"
        >
          Powered by DebugBundle
        </a>
      </footer>
    </main>
  );
}
