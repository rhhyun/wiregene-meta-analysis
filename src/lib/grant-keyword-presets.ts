import { createGrantJsonStorage } from "./grant-storage";
import type { GrantKeywordPreset, GrantSourceGroup } from "./types";

type KeywordPresetData = {
  presets: Partial<Record<GrantSourceGroup, GrantKeywordPreset>>;
};

const emptyData = (): KeywordPresetData => ({ presets: {} });

const sourceGroups: GrantSourceGroup[] = [
  "central",
  "regional-regulatory",
  "investment",
  "global-research",
  "trainee-fellowship",
];

export function normalizeGrantBaseKeywords(keywords: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const keyword of keywords) {
    const value = keyword.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
    if (normalized.length >= 5) break;
  }

  return normalized;
}

function sanitizePreset(sourceGroup: GrantSourceGroup, value: unknown): GrantKeywordPreset | null {
  if (!value || typeof value !== "object") return null;
  const preset = value as Partial<GrantKeywordPreset>;
  const baseKeywords = Array.isArray(preset.baseKeywords) ? normalizeGrantBaseKeywords(preset.baseKeywords) : [];
  if (baseKeywords.length === 0) return null;
  return {
    sourceGroup,
    baseKeywords,
    updatedAt: typeof preset.updatedAt === "string" ? preset.updatedAt : new Date(0).toISOString(),
  };
}

function normalizeData(value: unknown): KeywordPresetData {
  const parsed = typeof value === "object" && value !== null ? (value as Partial<KeywordPresetData>) : {};
  const presets: KeywordPresetData["presets"] = {};

  for (const sourceGroup of sourceGroups) {
    const preset = sanitizePreset(sourceGroup, parsed.presets?.[sourceGroup]);
    if (preset) presets[sourceGroup] = preset;
  }

  return { presets };
}

const keywordPresetStorage = createGrantJsonStorage<KeywordPresetData>({
  envName: "GRANT_KEYWORD_PRESET_STORAGE_PATH",
  defaultRelativePath: ".data/grant-keyword-presets.json",
  label: "grant keyword preset",
  emptyData,
  normalize: normalizeData,
});

async function readData(): Promise<KeywordPresetData> {
  return keywordPresetStorage.read();
}

async function writeData(data: KeywordPresetData) {
  await keywordPresetStorage.write(data);
}

export async function listGrantKeywordPresets() {
  const data = await readData();
  return sourceGroups
    .map((sourceGroup) => data.presets[sourceGroup])
    .filter((preset): preset is GrantKeywordPreset => Boolean(preset))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getGrantKeywordPreset(sourceGroup: GrantSourceGroup) {
  const data = await readData();
  return data.presets[sourceGroup] ?? null;
}

export async function saveGrantKeywordPreset(sourceGroup: GrantSourceGroup, keywords: string[]) {
  const baseKeywords = normalizeGrantBaseKeywords(keywords);
  const data = await readData();
  const preset: GrantKeywordPreset = {
    sourceGroup,
    baseKeywords,
    updatedAt: new Date().toISOString(),
  };

  data.presets[sourceGroup] = preset;
  await writeData(data);
  return preset;
}
