/** Browser event so dashboard pages refetch when data changes (Atlas tools, food log, etc.). */
export const FITAI_REFRESH_EVENT = "fitai:refresh";

const BROADCAST_CHANNEL = "fitai-dashboard-sync";

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

export function dispatchFitaiRefresh(detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FITAI_REFRESH_EVENT, { detail }));
  try {
    getBroadcastChannel()?.postMessage({ type: FITAI_REFRESH_EVENT, detail });
  } catch {
    /* ignore */
  }
}

/** Subscribe to cross-tab refresh (same channel as dispatch). */
export function subscribeFitaiBroadcast(onMessage: () => void): () => void {
  const ch = getBroadcastChannel();
  if (!ch) return () => {};
  const handler = (ev: MessageEvent) => {
    if (ev?.data?.type === FITAI_REFRESH_EVENT) onMessage();
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
