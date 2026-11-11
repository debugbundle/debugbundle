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
import type { SessionRecord } from "../../lib/api.js";
import { loadWorkspaceHealthAlert } from "../../lib/workspace-health-alert.js";

interface WorkspaceHealthAlert {
  down: boolean | null;
  refresh: () => void;
}
const WorkspaceHealthAlertContext = createContext<WorkspaceHealthAlert | null>(null);
export const useWorkspaceHealthAlert = (): WorkspaceHealthAlert | null =>
  useContext(WorkspaceHealthAlertContext);

export function WorkspaceHealthAlertProvider({
  session,
  children
}: {
  session: SessionRecord;
  children: ReactNode;
}): JSX.Element {
  return (
    <WorkspaceHealthAlertController
      key={`${session.user_id}:${session.organization_id}:${session.role}:${session.organization_plan}:${session.self_hosted}`}
    >
      {children}
    </WorkspaceHealthAlertController>
  );
}

function WorkspaceHealthAlertController({ children }: { children: ReactNode }): JSX.Element {
  const [down, setDown] = useState<boolean | null>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const requestId = useRef(0);
  const refresh = useCallback(async (force = false) => {
    if (!mounted.current || (pending.current && !force)) return;
    const id = ++requestId.current;
    pending.current = true;
    const isCurrent = (): boolean => mounted.current && requestId.current === id;
    const result = await loadWorkspaceHealthAlert(isCurrent);
    if (isCurrent()) {
      setDown(result);
      pending.current = false;
    }
  }, []);
  const refreshNow = useCallback(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === "visible") void refresh();
    };
    refreshWhenVisible();
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      mounted.current = false;
      requestId.current += 1;
      pending.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({ down, refresh: refreshNow }), [down, refreshNow]);
  return (
    <WorkspaceHealthAlertContext.Provider value={value}>
      {children}
    </WorkspaceHealthAlertContext.Provider>
  );
}
