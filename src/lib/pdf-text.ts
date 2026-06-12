type PdfParseTextResult = {
  text: string;
  pageLimitApplied: boolean;
  totalPages: number;
};

type PdfCanvasModule = {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
};

export async function extractPdfTextWithPdfParse(buffer: Buffer, maxPages: number): Promise<PdfParseTextResult> {
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  installPdfParseNodePolyfills(require);

  const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({ first: maxPages });
    return {
      text: result.text ?? "",
      pageLimitApplied: result.total > maxPages,
      totalPages: result.total,
    };
  } finally {
    await parser.destroy();
  }
}

function installPdfParseNodePolyfills(require: NodeRequire) {
  const target = globalThis as Record<string, unknown>;
  if (target.DOMMatrix && target.ImageData && target.Path2D) return;

  let canvas: PdfCanvasModule | null = null;
  try {
    canvas = require("@napi-rs/canvas") as PdfCanvasModule;
  } catch {
    canvas = null;
  }

  target.DOMMatrix ??= canvas?.DOMMatrix;
  target.ImageData ??= canvas?.ImageData;
  target.Path2D ??= canvas?.Path2D;

  if (!target.DOMMatrix) {
    throw new Error("PDF text extraction could not initialize DOMMatrix from @napi-rs/canvas.");
  }
}
