import type { BriefingItem } from "./types";

export const HYUNLAB_JOURNAL_CLUB_URL =
  "https://hyunlab.wiregene.com/hyunlab-wiregene/workspaces/hyunlab/journal-club";

export function buildHyunlabJournalClubUrl(item: BriefingItem) {
  const params = new URLSearchParams();
  params.set("title", item.title);
  params.set("journal", item.sourceName);
  params.set("source_url", item.url);
  params.set("search_source", "search.wiregene.com");

  if (item.abstract || item.summary || item.snippet) {
    params.set("abstract", item.abstract ?? item.summary ?? item.snippet ?? "");
  }
  if (item.authors.length > 0) {
    params.set("authors", item.authors.join(", "));
  }
  if (item.publishedAt) {
    params.set("published_on", item.publishedAt);
  }
  if (item.doi) {
    params.set("doi", item.doi);
  }
  if (item.pmid) {
    params.set("pmid", item.pmid);
    params.set("external_id", item.pmid);
  } else if (item.sourceId) {
    params.set("external_id", item.sourceId);
  }

  return `${HYUNLAB_JOURNAL_CLUB_URL}?${params.toString()}`;
}
