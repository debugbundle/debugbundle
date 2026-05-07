import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { getSession, type SessionRecord } from "./api.js";

interface SessionContextValue {
  session: SessionRecord | null;
  isLoading: boolean;
  refreshSession: () => Promise<SessionRecord | null>;
  setSession: (session: SessionRecord | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasBootstrappedSession = useRef(false);

  async function refreshSession(): Promise<SessionRecord | null> {
    setIsLoading(true);

    try {
      const nextSession = await getSession();
      setSession(nextSession);
      return nextSession;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (hasBootstrappedSession.current) {
      return;
    }

    hasBootstrappedSession.current = true;
    void refreshSession();
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      refreshSession,
      setSession
    }),
    [session, isLoading]
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