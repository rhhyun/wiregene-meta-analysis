import { defaultTopics } from "./topics";
import type { TopicProfile } from "./types";

type TopicInput = Partial<TopicProfile> & { name: string };

const fallbackJournals = Array.from(
  new Set(defaultTopics.flatMap((topic) => topic.highImpactJournals)),
);

function list(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function slugify(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeTopicProfiles(values: TopicInput[]) {
  return values
    .map((value, index) => {
      const name = String(value.name ?? "").trim();
      if (!name) return null;

      const terms = uniq(list(value.terms));
      const meshTerms = uniq(list(value.meshTerms));
      const usNewsTerms = uniq(list(value.usNewsTerms));
      const krNewsTerms = uniq(list(value.krNewsTerms));

      return {
        slug: slugify(value.slug || name, `topic-${index + 1}`),
        name,
        description: String(value.description ?? "").trim() || `${name} research topic.`,
        terms: terms.length > 0 ? terms : [name],
        meshTerms,
        koreanTerms: uniq(list(value.koreanTerms)),
        highImpactJournals:
          uniq(list(value.highImpactJournals)).length > 0
            ? uniq(list(value.highImpactJournals))
            : fallbackJournals,
        usNewsTerms: usNewsTerms.length > 0 ? usNewsTerms : terms.length > 0 ? terms : [name],
        krNewsTerms,
      } satisfies TopicProfile;
    })
    .filter(Boolean) as TopicProfile[];
}

export function defaultTopicDraft() {
  return defaultTopics.map((topic) => ({ ...topic }));
}

