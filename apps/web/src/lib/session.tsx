import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import {
  getSession,
  isInvalidSessionError,
  subscribeToBrowserSessionInvalidation,
  type SessionRecord
} from "./api.js";
import { rememberSession } from "./api-client.js";
import { renewBrowserSession } from "./api-auth.js";
import { subscribeToSessionActivity } from "./session-activity.js";

interface SessionContextValue {
  session: SessionRecord | null;
  isLoading: boolean;
  sessionInvalidationCount: number;
  sessionLoadError: boolean;
  retrySession: () => Promise<void>;
  refreshSession: () => Promise<SessionRecord | null>;
  setSession: (session: SessionRecord | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, updateSession] = useState<SessionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionInvalidationCount, setSessionInvalidationCount] = useState(0);
  const hasBootstrappedSession = useRef(false);
  const sessionRequestPending = useRef(false);
  const [sessionLoadError, setSessionLoadError] = useState(false);
  const pendingRefresh = useRef<Promise<SessionRecord | null> | null>(null);
  const sessionRevision = useRef(0);

  const setSession = useCallback((nextSession: SessionRecord | null): void => {
    sessionRevision.current += 1;
    rememberSession(nextSession);
    updateSession(nextSession);
  }, []);

  const refreshSession = useCallback((): Promise<SessionRecord | null> => {
    if (pendingRefresh.current !== null) return pendingRefresh.current;
    const revision = sessionRevision.current;
    const request = getSession()
      .then((nextSession) => {
        if (sessionRevision.current === revision) updateSession(nextSession);
        return nextSession;
      })
      .finally(() => {
        pendingRefresh.current = null;
      });
    pendingRefresh.current = request;
    return request;
  }, []);

  const retrySession = useCallback(async (): Promise<void> => {
    if (sessionRequestPending.current) return;
    sessionRequestPending.current = true;
    setIsLoading(true);
    try {
      await refreshSession();
      setSessionLoadError(false);
    } catch {
      // A failed read does not establish that the browser is signed out.
      setSessionLoadError(true);
    } finally {
      sessionRequestPending.current = false;
      setIsLoading(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    if (hasBootstrappedSession.current) {
      return;
    }

    hasBootstrappedSession.current = true;
    void retrySession();
  }, [retrySession]);

  useEffect(() => {
    return subscribeToBrowserSessionInvalidation(() => {
      sessionRevision.current += 1;
      updateSession(null);
      setSessionLoadError(false);
      setIsLoading(false);
      setSessionInvalidationCount((current) => current + 1);
    });
  }, []);

  useEffect(() => {
    if (session === null) return;
    const checkSession = (): void => {
      if (document.visibilityState !== "visible") return;
      // This is a background read: keep the current page mounted and retain
      // the established session if the network/server is temporarily unavailable.
      void refreshSession().catch(() => undefined);
    };
    window.addEventListener("focus", checkSession);
    document.addEventListener("visibilitychange", checkSession);
    return () => {
      window.removeEventListener("focus", checkSession);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [session, refreshSession]);

  const sessionId = session?.session_id;
  useEffect(() => {
    if (sessionId === undefined) return;
    let stopped = false;
    const unsubscribe = subscribeToSessionActivity(async () => {
      const revision = sessionRevision.current;
      const renewed = await renewBrowserSession();
      if (!stopped && sessionRevision.current === revision) updateSession(renewed);
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [sessionId]);

  useEffect(() => {
    function handleUnhandledRejection(event: PromiseRejectionEvent): void {
      if (isInvalidSessionError(event.reason)) {
        event.preventDefault();
      }
    }

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      sessionInvalidationCount,
      sessionLoadError,
      retrySession,
      refreshSession,
      setSession
    }),
    [
      session,
      isLoading,
      sessionInvalidationCount,
      sessionLoadError,
      retrySession,
      refreshSession,
      setSession
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);

  if (context === null) {
    throw new Error("useSession must be used within SessionProvider");
  }

  return context;
}
