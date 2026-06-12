import WordExtractor from "word-extractor";

type WordTextResult = {
  text: string;
  totalPages: null;
};

export async function extractWordTextWithWordExtractor(buffer: Buffer): Promise<WordTextResult> {
  try {
    const extractor = new WordExtractor();
    const document = await extractor.extract(buffer);
    const chunks = [
      document.getBody(),
      document.getFootnotes(),
      document.getEndnotes(),
      document.getHeaders({ includeFooters: false }),
      document.getFooters(),
      document.getAnnotations(),
      document.getTextboxes(),
    ];

    return {
      text: cleanWordText(chunks.filter(Boolean).join("\n\n")),
      totalPages: null,
    };
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new Error(`Word full-text file could not be read. Please upload a readable .doc/.docx file or export it as PDF.${detail}`);
  }
}

function cleanWordText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
