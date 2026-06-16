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
      'musician*[Title/Abstract] OR instrumentalist*[Title/Abstract] OR orchestra*[Title/Abstract] OR "performing artist*"[Title/Abstract]',
  },
  {
    key: "instrument",
    label: "2. Instrument terms",
    query:
      'violin*[Title/Abstract] OR viola*[Title/Abstract] OR cello*[Title/Abstract] OR "double bass"[Title/Abstract] OR contrabass[Title/Abstract] OR flute*[Title/Abstract] OR guitar*[Title/Abstract] OR mandolin*[Title/Abstract] OR clarinet*[Title/Abstract] OR oboe*[Title/Abstract] OR bassoon*[Title/Abstract] OR trumpet*[Title/Abstract] OR trombone*[Title/Abstract] OR "french horn"[Title/Abstract] OR percussion*[Title/Abstract] OR piano*[Title/Abstract] OR harp[Title/Abstract]',
  },
  {
    key: "condition",
    label: "3. Pain/PRMD condition",
    query:
      '"Musculoskeletal Pain"[Mesh] OR "Musculoskeletal Diseases"[Mesh] OR pain[Title/Abstract] OR musculoskeletal[Title/Abstract] OR PRMD[Title/Abstract] OR "playing-related"[Title/Abstract] OR "playing-related musculoskeletal disorder*"[Title/Abstract] OR "performance-related musculoskeletal disorder*"[Title/Abstract] OR "performance-related pain"[Title/Abstract] OR "musician* pain"[Title/Abstract] OR overuse[Title/Abstract] OR injury[Title/Abstract] OR disorder*[Title/Abstract] OR "repetitive strain"[Title/Abstract] OR "overuse syndrome"[Title/Abstract]',
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
export const pubMedEnglishFilter = "english[Language]";

export function buildSystematicPubMedQuery(blocks: PubMedQueryBlock[] = pubMedSystematicBlocks) {
  const combinedBlocks = blocks
    .filter((block) => block.includedInFinal !== false)
    .map((block) => `(${block.query})`)
    .join(" AND ");
  return `${combinedBlocks} AND ${pubMedHumanFilter} AND ${pubMedEnglishFilter}`;
}

export function buildPubMedSearchUrl(query: string) {
  const url = new URL("https://pubmed.ncbi.nlm.nih.gov/");
  url.searchParams.set("term", query);
  url.searchParams.set("sort", "date");
  return url.toString();
}
