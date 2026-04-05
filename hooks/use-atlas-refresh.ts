"use client";

import { useEffect } from "react";
import {
  FITAI_REFRESH_EVENT,
  subscribeFitaiBroadcast,
} from "@/lib/fitai-refresh";

/**
 * Calls `onRefresh` when FitAI data changes: same-tab events, tab focus return, and other tabs.
 */
export function useAtlasRefresh(onRefresh: () => void) {
  useEffect(() => {
    const run = () => onRefresh();

    const onEvent = () => run();
    window.addEventListener(FITAI_REFRESH_EVENT, onEvent);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);

    const unsubBc = subscribeFitaiBroadcast(run);

    return () => {
      window.removeEventListener(FITAI_REFRESH_EVENT, onEvent);
      document.removeEventListener("visibilitychange", onVisible);
      unsubBc();
    };
  }, [onRefresh]);
}
