import type { BriefingItem } from "./types";

function line(tag: string, value: string | null | undefined) {
  if (!value) return "";
  return `${tag}  - ${value.replace(/\r?\n/g, " ")}\n`;
}

export function buildRis(items: BriefingItem[]) {
  return items
    .filter((item) => item.kind === "paper")
    .map((item) => {
      const year = item.publishedAt?.slice(0, 4);
      const authors = item.authors.map((author) => line("AU", author)).join("");
      return [
        "TY  - JOUR\n",
        line("TI", item.title),
        authors,
        line("JO", item.sourceName),
        line("PY", year),
        line("DA", item.publishedAt ?? undefined),
        line("DO", item.doi ?? undefined),
        line("UR", item.url),
        line("AB", item.abstract ?? item.summary ?? undefined),
        line("N1", item.pmid ? `PMID: ${item.pmid}` : undefined),
        "ER  - \n",
      ].join("");
    })
    .join("\n");
}
