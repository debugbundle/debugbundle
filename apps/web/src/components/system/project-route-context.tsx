import { createContext, useContext } from "react";

export interface ActiveProjectRoute {
  projectId: string;
  projectName: string;
}

export interface ProjectRouteContextValue {
  activeProject: ActiveProjectRoute | null;
  setActiveProject: React.Dispatch<React.SetStateAction<ActiveProjectRoute | null>>;
}

const ProjectRouteContext = createContext<ProjectRouteContextValue | null>(null);

export function ProjectRouteProvider({
  value,
  children
}: {
  value: ProjectRouteContextValue;
  children: React.ReactNode;
}): JSX.Element {
  return <ProjectRouteContext.Provider value={value}>{children}</ProjectRouteContext.Provider>;
}

export function useProjectRoute(): ProjectRouteContextValue {
  const context = useContext(ProjectRouteContext);
  if (context === null) {
    throw new Error("project_route_context_missing");
  }

  return context;
}