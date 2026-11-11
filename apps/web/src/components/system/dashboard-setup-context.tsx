import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useLocation } from "react-router-dom";
import {
  dashboardSetupProgress,
  parseDashboardSetupPreferences,
  type DashboardSetupFacts,
  type DashboardSetupPreferences
} from "../../../../../packages/shared-types/src/dashboard-setup.js";
import type { SessionRecord } from "../../lib/api.js";
import {
  emptyDashboardSetupFacts,
  loadDashboardSetupFacts
} from "../../lib/dashboard-setup-data.js";
import {
  dashboardSetupStorageKey,
  readDashboardSetupPreferences,
  writeDashboardSetupPreferences
} from "../../lib/dashboard-setup-preferences.js";
import { DashboardSetupDialog } from "./dashboard-setup-dialog.js";

interface DashboardSetupContextValue {
  progress: ReturnType<typeof dashboardSetupProgress>;
  loading: boolean;
  refreshing: boolean;
  sidebarHidden: boolean;
  openGuide: () => void;
  dismissReminder: () => void;
}
const DashboardSetupContext = createContext<DashboardSetupContextValue | null>(null);
export const useDashboardSetup = (): DashboardSetupContextValue | null =>
  useContext(DashboardSetupContext);

export function DashboardSetupProvider({
  session,
  children
}: {
  session: SessionRecord;
  children: ReactNode;
}): JSX.Element {
  // A workspace/account switch mounts a fresh controller before showing any old progress.
  return (
    <DashboardSetupController
      key={`${session.user_id}:${session.organization_id}:${session.organization_plan}:${session.role}:${session.self_hosted}`}
      session={session}
    >
      {children}
    </DashboardSetupController>
  );
}

function DashboardSetupController({
  session,
  children
}: {
  session: SessionRecord;
  children: ReactNode;
}): JSX.Element {
  const location = useLocation();
  // A preview lasts for this mounted shell, including navigation to setup screens.
  // Only the local simulator can supply it; no account data or saved preference is reset.
  const [previewState] = useState(() => {
    if (!import.meta.env.DEV || import.meta.env.VITE_DEBUGBUNDLE_DEV_MOCK !== "true") return null;
    const value = new URLSearchParams(location.search).get("setup");
    return value === "empty" || value === "started" ? value : null;
  });
  const storageKey = dashboardSetupStorageKey(session.user_id, session.organization_id);
  const [preferences, setPreferences] = useState(() =>
    previewState === null
      ? readDashboardSetupPreferences(storageKey)
      : { ...parseDashboardSetupPreferences(null), welcomeSeen: true }
  );
  const preferenceRef = useRef(preferences);
  const [facts, setFacts] = useState<DashboardSetupFacts | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<"welcome" | "guide" | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const requestId = useRef(0);
  const mounted = useRef(false);
  const welcomePreviewShown = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const progress = dashboardSetupProgress({
    ...(facts ?? emptyDashboardSetupFacts(session)),
    ...(preferences.incidentReceived ? { incident: true } : {})
  });

  const updatePreferences = useCallback(
    (patch: Partial<DashboardSetupPreferences>) => {
      const next = { ...preferenceRef.current, ...patch };
      preferenceRef.current = next;
      setPreferences(next);
      if (previewState === null) writeDashboardSetupPreferences(storageKey, next);
    },
    [storageKey, previewState]
  );

  const refresh = useCallback(
    async (includeOptional = modeRef.current === "guide") => {
      const currentRequest = ++requestId.current;
      setRefreshing(true);
      let next: DashboardSetupFacts;
      try {
        next =
          previewState === null
            ? await loadDashboardSetupFacts(
                session,
                preferenceRef.current.incidentReceived,
                includeOptional
              )
            : {
                ...emptyDashboardSetupFacts(session),
                accessToken: previewState === "started",
                project: false,
                incident: false,
                analytics: false,
                improvements: false,
                reports: false
              };
      } catch {
        next = emptyDashboardSetupFacts(session);
      }
      if (!mounted.current || currentRequest !== requestId.current) return;
      setFacts(next);
      setRefreshing(false);
      if (next.incident === true && !preferenceRef.current.incidentReceived)
        updatePreferences({ incidentReceived: true });
    },
    [session, updatePreferences, previewState]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
    };
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);
  useEffect(() => {
    if (facts === null) return;
    // Replay only in the opt-in local simulator; real setup observations remain intact.
    const previewWelcome =
      import.meta.env.DEV &&
      import.meta.env.VITE_DEBUGBUNDLE_DEV_MOCK === "true" &&
      new URLSearchParams(location.search).get("welcome") === "1" &&
      !welcomePreviewShown.current;
    if (preferences.welcomeSeen && !previewWelcome) return;
    if (!previewWelcome && (facts.project === true || facts.accessToken === true)) {
      updatePreferences({ welcomeSeen: true });
    } else if (
      location.pathname === "/dashboard" &&
      (previewWelcome || (facts.project === false && facts.accessToken === false))
    ) {
      welcomePreviewShown.current = true;
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      updatePreferences({ welcomeSeen: true });
      setMode("welcome");
    }
  }, [facts, location.pathname, location.search, preferences.welcomeSeen, updatePreferences]);
  useEffect(() => {
    const onFocus = (): void => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", onFocus);
    const timer =
      mode !== null || (!preferences.sidebarHidden && !progress.ready)
        ? window.setInterval(onFocus, 30_000)
        : undefined;
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [mode, preferences.sidebarHidden, progress.ready, refresh]);
  useEffect(() => {
    if (previewState !== null) return;
    function onStorage(event: StorageEvent): void {
      if (event.key !== storageKey) return;
      const next = readDashboardSetupPreferences(storageKey);
      preferenceRef.current = next;
      setPreferences(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, previewState]);

  function openGuide(): void {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    updatePreferences({ welcomeSeen: true, sidebarHidden: false });
    setMode("guide");
    void refresh(true);
  }
  function close(): void {
    updatePreferences({ welcomeSeen: true });
    setMode(null);
  }

  return (
    <DashboardSetupContext.Provider
      value={{
        progress,
        loading: facts === null,
        refreshing,
        sidebarHidden: preferences.sidebarHidden,
        openGuide,
        dismissReminder: () => updatePreferences({ sidebarHidden: true })
      }}
    >
      {children}
      <DashboardSetupDialog
        mode={mode}
        progress={progress}
        loading={facts === null}
        refreshing={refreshing}
        onClose={close}
        onShowGuide={() => {
          setMode("guide");
          void refresh(true);
        }}
        onRefresh={() => void refresh()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected && returnFocus.current !== document.body)
            returnFocus.current.focus();
          else
            document
              .querySelector<HTMLElement>(
                '[data-dashboard-setup-trigger], [data-sidebar="trigger"]'
              )
              ?.focus();
        }}
      />
    </DashboardSetupContext.Provider>
  );
}
