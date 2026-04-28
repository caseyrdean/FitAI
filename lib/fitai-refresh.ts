/** Browser event so dashboard pages refetch when data changes (Atlas tools, food log, etc.). */
export const FITAI_REFRESH_EVENT = "fitai:refresh";

const BROADCAST_CHANNEL = "fitai-dashboard-sync";

export const FITAI_REFRESH_SCOPES = [
  "meals",
  "foodlog",
  "progress",
  "workouts",
  "bloodwork",
  "supplements",
  "profile",
  "atlas",
  "dashboard",
] as const;

export type FitaiRefreshScope = (typeof FITAI_REFRESH_SCOPES)[number];

export type FitaiRefreshDetail = {
  source?: string;
  reason?: string;
  scopes?: FitaiRefreshScope[];
  /** Backward-compatible alias used by existing Atlas SSE events. */
  target?: FitaiRefreshScope;
};

function isRefreshScope(value: unknown): value is FitaiRefreshScope {
  return (
    typeof value === "string" &&
    (FITAI_REFRESH_SCOPES as readonly string[]).includes(value)
  );
}

function normalizeScopes(raw: unknown): FitaiRefreshScope[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRefreshScope);
}

function normalizeDetail(detail?: FitaiRefreshDetail): FitaiRefreshDetail {
  if (!detail) return {};
  const scopes = normalizeScopes(detail.scopes);
  if (scopes.length > 0) return { ...detail, scopes };
  if (isRefreshScope(detail.target)) return { ...detail, scopes: [detail.target] };
  return { ...detail, scopes: [] };
}

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL);
    } catch {
      return null;
    }
  }
  return broadcastChannel;
}

export function dispatchFitaiRefresh(detail?: FitaiRefreshDetail) {
  if (typeof window === "undefined") return;
  const normalized = normalizeDetail(detail);
  window.dispatchEvent(new CustomEvent<FitaiRefreshDetail>(FITAI_REFRESH_EVENT, { detail: normalized }));
  try {
    getBroadcastChannel()?.postMessage({ type: FITAI_REFRESH_EVENT, detail: normalized });
  } catch {
    /* ignore */
  }
}

/** Subscribe to cross-tab refresh (same channel as dispatch). */
export function subscribeFitaiBroadcast(
  onMessage: (detail: FitaiRefreshDetail) => void,
): () => void {
  const ch = getBroadcastChannel();
  if (!ch) return () => {};
  const handler = (ev: MessageEvent) => {
    if (ev?.data?.type === FITAI_REFRESH_EVENT) {
      onMessage(normalizeDetail(ev.data.detail));
    }
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
