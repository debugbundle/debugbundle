import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";

interface HeaderAction {
  pathname: string;
  content: ReactNode;
}

interface HeaderActionsContextValue {
  action: HeaderAction | null;
  setAction: Dispatch<SetStateAction<HeaderAction | null>>;
}

const HeaderActionsContext = createContext<HeaderActionsContextValue | null>(null);

export function HeaderActionsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [action, setAction] = useState<HeaderAction | null>(null);

  return (
    <HeaderActionsContext.Provider value={{ action, setAction }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

export function useHeaderActions(): HeaderActionsContextValue {
  const context = useContext(HeaderActionsContext);
  if (context === null) {
    throw new Error("header_actions_context_missing");
  }

  return context;
}
