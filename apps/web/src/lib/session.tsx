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
  refreshSession: () => Promise<SessionRecord | null>;
  setSession: (session: SessionRecord | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionInvalidationCount, setSessionInvalidationCount] = useState(0);
  const hasBootstrappedSession = useRef(false);

  const refreshSession = useCallback(async (): Promise<SessionRecord | null> => {
    const nextSession = await getSession();
    setSession(nextSession);
    return nextSession;
  }, []);

  useEffect(() => {
    if (hasBootstrappedSession.current) {
      return;
    }

    hasBootstrappedSession.current = true;
    void refreshSession().finally(() => {
      setIsLoading(false);
    });
  }, [refreshSession]);

  useEffect(() => {
    return subscribeToBrowserSessionInvalidation(() => {
      setSession(null);
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
      refreshSession,
      setSession
    }),
    [session, isLoading, sessionInvalidationCount, refreshSession]
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
