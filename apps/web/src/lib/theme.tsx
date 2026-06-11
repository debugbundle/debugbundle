import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "debugbundle-theme";
export const SYSTEM_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getBrowserWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

function getBrowserDocument(): Document | null {
  return typeof document === "undefined" ? null : document;
}

export function getStoredTheme(windowLike: Pick<Window, "localStorage"> | null = getBrowserWindow()): ThemeMode {
  if (windowLike === null) {
    return "system";
  }

  const stored = windowLike.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function resolveTheme(
  theme: ThemeMode,
  matchMedia?: (query: string) => MediaQueryList
): ResolvedTheme {
  const resolvedMatchMedia =
    matchMedia ?? (getBrowserWindow() === null ? undefined : (query: string): MediaQueryList => window.matchMedia(query));

  if (theme === "light" || theme === "dark") {
    return theme;
  }

  if (typeof resolvedMatchMedia !== "function") {
    return "light";
  }

  return resolvedMatchMedia(SYSTEM_THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

export function applyResolvedTheme(
  resolvedTheme: ResolvedTheme,
  documentLike: Pick<Document, "documentElement"> | null = getBrowserDocument()
): void {
  if (documentLike === null) {
    return;
  }

  documentLike.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  documentLike.documentElement.style.colorScheme = resolvedTheme;
}

export function initializeThemeDocument(
  windowLike: Pick<Window, "localStorage" | "matchMedia"> | null = getBrowserWindow(),
  documentLike: Pick<Document, "documentElement"> | null = getBrowserDocument()
): { theme: ThemeMode; resolvedTheme: ResolvedTheme } {
  const theme = getStoredTheme(windowLike);
  const resolvedTheme =
    resolveTheme(
      theme,
      windowLike === null ? undefined : (query: string): MediaQueryList => windowLike.matchMedia(query)
    );
  applyResolvedTheme(resolvedTheme, documentLike);

  return { theme, resolvedTheme };
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  useLayoutEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (browserWindow === null || typeof browserWindow.matchMedia !== "function") {
      return;
    }

    const mediaQuery = browserWindow.matchMedia(SYSTEM_THEME_MEDIA_QUERY);
    const listener = (): void => setResolvedTheme(resolveTheme(theme));

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(listener);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", listener);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(listener);
      }
    };
  }, [theme]);

  function setTheme(nextTheme: ThemeMode): void {
    setThemeState(nextTheme);
    setResolvedTheme(resolveTheme(nextTheme));

    const browserWindow = getBrowserWindow();
    if (browserWindow !== null) {
      browserWindow.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    }
  }

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme
    }),
    [theme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
