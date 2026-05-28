import { useEffect } from "react";

import {
  DEBUGBUNDLE_CHANGELOG_URL,
  fetchLatestAppBuildId,
  getCurrentAppBuildId,
  isDifferentAppBuild,
  rememberCurrentAppBuild
} from "../../lib/app-update.js";
import { showInfoToast } from "../../lib/notify.js";

export function AppUpdateNotifier(): null {
  useEffect(() => {
    const currentBuildId = getCurrentAppBuildId();
    try {
      const result = rememberCurrentAppBuild({
        currentBuildId,
        storage: window.localStorage
      });

      if (result.updatedSinceLastLoad) {
        showInfoToast("DebugBundle was updated.", {
          action: {
            label: "View changelog",
            onClick: () => window.open(DEBUGBUNDLE_CHANGELOG_URL, "_blank", "noopener,noreferrer")
          },
          duration: 8000
        });
      }
    } catch {
      // Storage access can fail in restricted browser modes; update checks should not block the app.
    }

    let isDisposed = false;
    let hasPromptedForCurrentUpdate = false;
    let lastCheckedAt = 0;
    const minCheckIntervalMs = 60_000;

    async function checkForUpdatedBuild(): Promise<void> {
      if (isDisposed || hasPromptedForCurrentUpdate || document.visibilityState === "hidden") {
        return;
      }

      const now = Date.now();
      if (now - lastCheckedAt < minCheckIntervalMs) {
        return;
      }
      lastCheckedAt = now;

      try {
        const latestBuildId = await fetchLatestAppBuildId();
        if (!isDifferentAppBuild({ currentBuildId, latestBuildId })) {
          return;
        }

        hasPromptedForCurrentUpdate = true;
        showInfoToast("A DebugBundle update is available.", {
          description: "Reload to use the latest build.",
          action: {
            label: "Reload",
            onClick: () => window.location.reload()
          },
          duration: 15000
        });
      } catch {
        // Network failures here are expected during flaky sessions and should stay silent.
      }
    }

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void checkForUpdatedBuild();
      }
    };
    const handleFocus = (): void => {
      void checkForUpdatedBuild();
    };
    const intervalId = window.setInterval(() => {
      void checkForUpdatedBuild();
    }, 300_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return null;
}
