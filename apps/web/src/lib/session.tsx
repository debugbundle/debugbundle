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
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionInvalidationCount, setSessionInvalidationCount] = useState(0);
  const hasBootstrappedSession = useRef(false);
  const sessionRequestPending = useRef(false);
  const [sessionLoadError, setSessionLoadError] = useState(false);

  const refreshSession = useCallback(async (): Promise<SessionRecord | null> => {
    const nextSession = await getSession();
    setSession(nextSession);
    return nextSession;
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
      setSession(null);
      setSessionLoadError(false);
      setIsLoading(false);
      setSessionInvalidationCount((current) => current + 1);
    });
  }, []);

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
    [session, isLoading, sessionInvalidationCount, sessionLoadError, retrySession, refreshSession]
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
