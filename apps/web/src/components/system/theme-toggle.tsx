import { MoonStarIcon, SunMediumIcon } from "lucide-react";

import { useTheme } from "../../lib/theme.js";
import { Button } from "../ui/button.js";

export function ThemeToggle(): JSX.Element {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <SunMediumIcon /> : <MoonStarIcon />}
    </Button>
  );
}