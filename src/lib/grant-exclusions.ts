import crypto from "crypto";
import { createGrantJsonStorage } from "./grant-storage";
import type { GrantExcludedOpportunity, GrantOpportunity, GrantSourceGroup } from "./types";

type GrantExclusionOpportunityInput = Partial<Record<"id" | "source" | "title" | "url", unknown>>;
type GrantExclusionMatchInput = Partial<Pick<GrantOpportunity, "id" | "source" | "url" | "title">>;

type ExclusionData = {
  exclusions: GrantExcludedOpportunity[];
};

const emptyData = (): ExclusionData => ({ exclusions: [] });
const sourceGroups: GrantSourceGroup[] = [
  "central",
  "regional-regulatory",
  "investment",
  "global-research",
  "trainee-fellowship",
];

function cleanText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.normalize("NFKC").replace(/\s+/g, " ").trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).normalize("NFKC").replace(/\s+/g, " ").trim() || fallback;
}

function normalizeUrl(value: unknown) {
  const text = cleanText(value);
  try {
    const url = new URL(text);
    url.hash = "";
    if (/iris\.go\.kr$/i.test(url.hostname) && url.searchParams.get("ancmId")) {
      const canonical = new URL("/contents/retrieveBsnsAncmView.do", url.origin);
      canonical.searchParams.set("ancmId", url.searchParams.get("ancmId") ?? "");
      return canonical.toString().replace(/\/$/, "");
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|yclid|igshid|setlang|cc)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return text;
  }
}

function normalizeTitle(value: unknown) {
  return cleanText(value).toLocaleLowerCase("ko-KR");
}

function normalizeSourceGroup(value: unknown): GrantSourceGroup {
  return sourceGroups.includes(value as GrantSourceGroup) ? (value as GrantSourceGroup) : "central";
}

export function grantExclusionId(
  sourceGroup: GrantSourceGroup,
  opportunity: GrantExclusionOpportunityInput,
) {
  return crypto
    .createHash("sha256")
    .update(
      `${sourceGroup}:${cleanText(opportunity.id)}:${normalizeUrl(opportunity.url)}:${normalizeTitle(opportunity.title)}`,
    )
    .digest("hex")
    .slice(0, 18);
}

function sanitizeExclusion(value: unknown): GrantExcludedOpportunity | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<GrantExcludedOpportunity>;
  const sourceGroup = normalizeSourceGroup(item.sourceGroup);
  const opportunity = {
    id: item.opportunityId ?? item.id,
    source: item.source,
    title: item.title,
    url: item.url,
  };
  const id = cleanText(item.id, grantExclusionId(sourceGroup, opportunity));

  return {
    id,
    sourceGroup,
    opportunityId: cleanText(item.opportunityId, id),
    source: cleanText(item.source, "Unknown"),
    title: cleanText(item.title, "Untitled opportunity"),
    url: normalizeUrl(item.url),
    excludedAt: cleanText(item.excludedAt, new Date(0).toISOString()),
    reason: item.reason === null || item.reason === undefined ? null : cleanText(item.reason),
  };
}

function normalizeData(value: unknown): ExclusionData {
  const parsed = typeof value === "object" && value !== null ? (value as Partial<ExclusionData>) : {};
  return {
    exclusions: Array.isArray(parsed.exclusions)
      ? parsed.exclusions.map(sanitizeExclusion).filter((item): item is GrantExcludedOpportunity => Boolean(item))
      : [],
  };
}

const exclusionStorage = createGrantJsonStorage<ExclusionData>({
  envName: "GRANT_EXCLUSION_STORAGE_PATH",
  defaultRelativePath: ".data/grant-exclusions.json",
  label: "grant exclusion",
  emptyData,
  normalize: normalizeData,
});

async function readData(): Promise<ExclusionData> {
  return exclusionStorage.read();
}

async function writeData(data: ExclusionData) {
  await exclusionStorage.write(data);
}

export async function listGrantExclusions() {
  const data = await readData();
  return [...data.exclusions].sort((a, b) => b.excludedAt.localeCompare(a.excludedAt));
}

export async function excludeGrantOpportunity({
  sourceGroup,
  opportunity,
  reason = null,
}: {
  sourceGroup: GrantSourceGroup;
  opportunity: GrantExclusionOpportunityInput;
  reason?: string | null;
}) {
  const data = await readData();
  const id = grantExclusionId(sourceGroup, opportunity);
  const exclusion: GrantExcludedOpportunity = {
    id,
    sourceGroup,
    opportunityId: cleanText(opportunity.id, id),
    source: cleanText(opportunity.source, "Unknown"),
    title: cleanText(opportunity.title, "제목 없음"),
    url: normalizeUrl(opportunity.url),
    excludedAt: new Date().toISOString(),
    reason,
  };

  data.exclusions = [exclusion, ...data.exclusions.filter((item) => item.id !== id)];
  await writeData(data);
  return exclusion;
}

export function isGrantOpportunityExcluded(
  opportunity: GrantExclusionMatchInput,
  exclusions: GrantExcludedOpportunity[],
  sourceGroup?: GrantSourceGroup,
) {
  const id = sourceGroup ? grantExclusionId(sourceGroup, opportunity) : "";
  const opportunityId = cleanText(opportunity.id);
  const normalizedSource = normalizeTitle(opportunity.source);
  const normalizedUrl = normalizeUrl(opportunity.url);
  const normalizedTitle = normalizeTitle(opportunity.title);

  return exclusions.some((exclusion) => {
    const sameGroup = !sourceGroup || exclusion.sourceGroup === sourceGroup;
    if (sameGroup && id && exclusion.id === id) return true;
    if (opportunityId && cleanText(exclusion.opportunityId) === opportunityId) return true;
    if (normalizedUrl && normalizeUrl(exclusion.url) === normalizedUrl) return true;
    if (!normalizedTitle || normalizeTitle(exclusion.title) !== normalizedTitle) return false;
    if (sameGroup) return true;
    return Boolean(normalizedSource && normalizeTitle(exclusion.source) === normalizedSource);
  });
}
