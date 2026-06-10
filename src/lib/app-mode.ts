export type WiregeneAppMode = "search" | "meta" | "portal";

const appModes: WiregeneAppMode[] = ["search", "meta", "portal"];

export function normalizeWiregeneAppMode(value: string | undefined | null): WiregeneAppMode {
  const normalized = value?.trim().toLowerCase();
  return appModes.includes(normalized as WiregeneAppMode)
    ? (normalized as WiregeneAppMode)
    : "search";
}

export function getWiregeneAppMode(host: string | undefined | null): WiregeneAppMode {
  const normalizedHost = (host ?? "").split(":")[0]?.toLowerCase() ?? "";

  if (normalizedHost === "meta.wiregene.com") return "meta";
  if (normalizedHost === "portal.wiregene.com") return "portal";
  if (normalizedHost === "search.wiregene.com") return "search";

  const explicitMode = process.env.WIREGENE_APP_MODE ?? process.env.NEXT_PUBLIC_WIREGENE_APP_MODE;
  if (explicitMode) return normalizeWiregeneAppMode(explicitMode);

  return "search";
}

export function appModeLabel(mode: WiregeneAppMode) {
  if (mode === "meta") return "Wiregene Meta";
  if (mode === "portal") return "Wiregene Portal";
  return "Research Briefing";
}
