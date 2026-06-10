export type ImportedRecord = {
  raw: string;
  title: string;
  key: string;
  duplicateOf?: string;
};

export type ImportSummary = {
  rawCount: number;
  uniqueCount: number;
  duplicateCount: number;
  uniqueRecords: ImportedRecord[];
  duplicateRecords: ImportedRecord[];
};

export function summarizeImportedRecords(text: string): ImportSummary {
  const parsedRecords = splitImportedRecords(text).map((block, index) => parseImportedRecord(block, index));
  const seen = new Map<string, ImportedRecord>();
  const uniqueRecords: ImportedRecord[] = [];
  const duplicateRecords: ImportedRecord[] = [];

  parsedRecords.forEach((record) => {
    const existing = seen.get(record.key);
    if (existing) {
      duplicateRecords.push({ ...record, duplicateOf: existing.title || existing.key });
      return;
    }
    seen.set(record.key, record);
    uniqueRecords.push(record);
  });

  return {
    rawCount: parsedRecords.length,
    uniqueCount: uniqueRecords.length,
    duplicateCount: duplicateRecords.length,
    uniqueRecords,
    duplicateRecords,
  };
}

function splitImportedRecords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const risBlocks = trimmed.match(/(?:^|\n)TY\s+-[\s\S]*?(?=\nTY\s+-|$)/g);
  if (risBlocks?.length) {
    return risBlocks.map((block) => block.trim()).filter(Boolean);
  }

  const bibtexBlocks = trimmed.match(/@\w+\s*{[\s\S]*?(?=\n@\w+\s*{|$)/g);
  if (bibtexBlocks?.length) {
    return bibtexBlocks.map((block) => block.trim()).filter(Boolean);
  }

  const paragraphBlocks = trimmed.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  if (paragraphBlocks.length > 1) {
    return paragraphBlocks;
  }

  return trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function parseImportedRecord(block: string, index: number): ImportedRecord {
  const doi = findField(block, ["DO", "doi"]);
  const pmid = findField(block, ["PMID", "PM", "pubmed"]);
  const title = findField(block, ["TI", "T1", "title"]) || inferTitle(block);
  const normalizedKey = normalizeDedupKey(doi || pmid || title || block);

  return {
    raw: block,
    title: title || `Imported record ${index + 1}`,
    key: doi ? `doi:${normalizedKey}` : pmid ? `pmid:${normalizedKey}` : `title:${normalizedKey}`,
  };
}

function findField(block: string, tags: string[]) {
  for (const tag of tags) {
    const risMatch = block.match(new RegExp(`^${escapeRegex(tag)}\\s+-\\s*(.+)$`, "im"));
    if (risMatch?.[1]) return risMatch[1].trim();

    const assignmentMatch = block.match(new RegExp(`${escapeRegex(tag)}\\s*=\\s*[{\"]([^}\"]+)`, "i"));
    if (assignmentMatch?.[1]) return assignmentMatch[1].trim();
  }
  return "";
}

function inferTitle(block: string) {
  const cells = block
    .split(/\t|,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
    .map((cell) => cell.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
  const bestCell = cells.find((cell) => cell.length > 24) || cells[0];
  return bestCell || block.split(/\n/)[0]?.trim() || "";
}

function normalizeDedupKey(value: string) {
  return value.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/[^a-z0-9]+/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
