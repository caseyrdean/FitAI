export const FITAI_ATLAS_LAUNCH_EVENT = "fitai:atlas-launch";

export type AtlasLaunchMode = "onboarding" | "checkin" | "chat";

export type AtlasLaunchDetail = {
  mode?: AtlasLaunchMode;
  prompt?: string;
};

export function launchAtlas(detail?: AtlasLaunchDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AtlasLaunchDetail>(FITAI_ATLAS_LAUNCH_EVENT, {
      detail: detail ?? {},
    }),
  );
}
