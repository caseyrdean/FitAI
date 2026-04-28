"use client";

import { useEffect } from "react";
import {
  FITAI_REFRESH_EVENT,
  type FitaiRefreshDetail,
  type FitaiRefreshScope,
  subscribeFitaiBroadcast,
} from "@/lib/fitai-refresh";

/**
 * Calls `onRefresh` when FitAI data changes: same-tab events, tab focus return, and other tabs.
 */
export function useAtlasRefresh(
  onRefresh: (detail?: FitaiRefreshDetail) => void,
  options?: { scopes?: FitaiRefreshScope[]; includeVisibility?: boolean },
) {
  useEffect(() => {
    const enabledScopes = options?.scopes ?? [];
    const includeVisibility = options?.includeVisibility ?? true;
    const shouldRun = (detail?: FitaiRefreshDetail) => {
      if (enabledScopes.length === 0) return true;
      const scopes = detail?.scopes ?? [];
      return scopes.some((scope) => enabledScopes.includes(scope));
    };
    const run = (detail?: FitaiRefreshDetail) => {
      if (!shouldRun(detail)) return;
      onRefresh(detail);
    };

    const onEvent = (event: Event) => {
      const customEvent = event as CustomEvent<FitaiRefreshDetail>;
      run(customEvent.detail);
    };
    window.addEventListener(FITAI_REFRESH_EVENT, onEvent);

    const onVisible = () => {
      if (!includeVisibility) return;
      if (document.visibilityState === "visible") {
        run({ source: "visibility", reason: "tab-visible" });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const unsubBc = subscribeFitaiBroadcast(run);

    return () => {
      window.removeEventListener(FITAI_REFRESH_EVENT, onEvent);
      document.removeEventListener("visibilitychange", onVisible);
      unsubBc();
    };
  }, [onRefresh, options?.includeVisibility, options?.scopes]);
}
