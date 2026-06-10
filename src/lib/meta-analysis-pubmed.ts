export type PubMedQueryBlock = {
  key: string;
  label: string;
  query: string;
  includedInFinal?: boolean;
};

export const pubMedSystematicBlocks: PubMedQueryBlock[] = [
  {
    key: "population",
    label: "1. Musician population",
    query:
      '"Music"[MeSH Terms] OR musician*[Title/Abstract] OR instrumentalist*[Title/Abstract] OR "music student"[Title/Abstract] OR "music students"[Title/Abstract] OR "music school"[Title/Abstract] OR "music schools"[Title/Abstract] OR conservatoire*[Title/Abstract] OR ((conservatory[Title/Abstract] OR conservatories[Title/Abstract]) AND music*[Title/Abstract]) OR orchestra*[Title/Abstract] OR pianist*[Title/Abstract] OR violinist*[Title/Abstract] OR violist*[Title/Abstract] OR cellist*[Title/Abstract] OR guitarist*[Title/Abstract] OR drummer*[Title/Abstract] OR flutist*[Title/Abstract] OR flautist*[Title/Abstract] OR clarinetist*[Title/Abstract] OR saxophonist*[Title/Abstract] OR trumpeter*[Title/Abstract] OR trombonist*[Title/Abstract] OR oboist*[Title/Abstract] OR bassoonist*[Title/Abstract] OR harpist*[Title/Abstract]',
  },
  {
    key: "condition",
    label: "2. PRMD/pain condition",
    query:
      '"Musculoskeletal Pain"[MeSH Terms] OR "Musculoskeletal Diseases"[MeSH Terms] OR "Cumulative Trauma Disorders"[MeSH Terms] OR "Occupational Diseases"[MeSH Terms] OR musculoskeletal[Title/Abstract] OR pain[Title/Abstract] OR painful[Title/Abstract] OR injur*[Title/Abstract] OR "performance-related musculoskeletal disorder"[Title/Abstract] OR "performance-related musculoskeletal disorders"[Title/Abstract] OR "performance related musculoskeletal disorder"[Title/Abstract] OR "performance related musculoskeletal disorders"[Title/Abstract] OR PRMD[Title/Abstract] OR PRMDs[Title/Abstract] OR "playing-related musculoskeletal disorder"[Title/Abstract] OR "playing-related musculoskeletal disorders"[Title/Abstract] OR "playing related musculoskeletal disorder"[Title/Abstract] OR "playing related musculoskeletal disorders"[Title/Abstract] OR "playing-related pain"[Title/Abstract] OR "playing related pain"[Title/Abstract] OR "overuse injury"[Title/Abstract] OR "overuse injuries"[Title/Abstract] OR "overuse syndrome"[Title/Abstract] OR "overuse syndromes"[Title/Abstract] OR "repetitive strain injury"[Title/Abstract] OR "repetitive stress injury"[Title/Abstract] OR "cumulative trauma"[Title/Abstract]',
  },
  {
    key: "prevalence",
    label: "3. Prevalence/design",
    query:
      '"Prevalence"[MeSH Terms] OR "Epidemiology"[MeSH Terms] OR "Cross-Sectional Studies"[MeSH Terms] OR prevalence[Title/Abstract] OR prevalent[Title/Abstract] OR epidemiolog*[Title/Abstract] OR frequency[Title/Abstract] OR incidence[Title/Abstract] OR survey[Title/Abstract] OR surveys[Title/Abstract] OR questionnaire*[Title/Abstract] OR "cross-sectional"[Title/Abstract] OR "cross sectional"[Title/Abstract]',
  },
  {
    key: "region",
    label: "Optional. Anatomical region refinement",
    includedInFinal: false,
    query:
      '"Neck Pain"[MeSH Terms] OR "Shoulder Pain"[MeSH Terms] OR "Back Pain"[MeSH Terms] OR "Low Back Pain"[MeSH Terms] OR "Temporomandibular Joint Disorders"[MeSH Terms] OR neck[Title/Abstract] OR shoulder*[Title/Abstract] OR elbow*[Title/Abstract] OR wrist*[Title/Abstract] OR hand*[Title/Abstract] OR back[Title/Abstract] OR lumbar[Title/Abstract] OR thoracic[Title/Abstract] OR jaw[Title/Abstract] OR temporomandibular[Title/Abstract]',
  },
];

export const pubMedHumanFilter = 'NOT (animals[MeSH Terms] NOT humans[MeSH Terms])';

export function buildSystematicPubMedQuery(blocks: PubMedQueryBlock[] = pubMedSystematicBlocks) {
  const combinedBlocks = blocks
    .filter((block) => block.includedInFinal !== false)
    .map((block) => `(${block.query})`)
    .join(" AND ");
  return `${combinedBlocks} ${pubMedHumanFilter}`;
}

export function buildPubMedSearchUrl(query: string) {
  const url = new URL("https://pubmed.ncbi.nlm.nih.gov/");
  url.searchParams.set("term", query);
  url.searchParams.set("sort", "date");
  return url.toString();
}
