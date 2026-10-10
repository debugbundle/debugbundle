import {
  createContext,
  useCallback,
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

export function getStoredTheme(
  windowLike: Pick<Window, "localStorage"> | null = getBrowserWindow()
): ThemeMode {
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
  const browserWindow = getBrowserWindow();
  const resolvedMatchMedia =
    matchMedia ??
    (browserWindow === null || typeof browserWindow.matchMedia !== "function"
      ? undefined
      : (query: string): MediaQueryList => browserWindow.matchMedia(query));

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
  documentLike: Pick<Document, "documentElement"> | null = getBrowserDocument(),
  forcedTheme?: ThemeMode
): { theme: ThemeMode; resolvedTheme: ResolvedTheme } {
  const theme = forcedTheme ?? getStoredTheme(windowLike);
  const resolvedTheme = resolveTheme(
    theme,
    windowLike === null || typeof windowLike.matchMedia !== "function"
      ? undefined
      : (query: string): MediaQueryList => windowLike.matchMedia(query)
  );
  applyResolvedTheme(resolvedTheme, documentLike);

  return { theme, resolvedTheme };
}

export function ThemeProvider({
  children,
  forcedTheme
}: {
  children: ReactNode;
  forcedTheme?: ThemeMode;
}): JSX.Element {
  // Public pages follow the device without reading or overwriting dashboard preferences.
  const [preference, setThemeState] = useState<ThemeMode>(() => forcedTheme ?? getStoredTheme());
  const theme = forcedTheme ?? preference;
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => resolveTheme("system"));
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useLayoutEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (
      theme !== "system" ||
      browserWindow === null ||
      typeof browserWindow.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = browserWindow.matchMedia(SYSTEM_THEME_MEDIA_QUERY);
    const listener = (): void => setSystemTheme(resolveTheme("system"));
    listener();

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

  const setTheme = useCallback(
    (nextTheme: ThemeMode): void => {
      if (forcedTheme !== undefined) return;
      setThemeState(nextTheme);
      setSystemTheme(resolveTheme("system"));

      const browserWindow = getBrowserWindow();
      if (browserWindow !== null) {
        browserWindow.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      }
    },
    [forcedTheme]
  );

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme
    }),
    [theme, resolvedTheme, setTheme]
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
