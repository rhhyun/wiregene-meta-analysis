import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { buildPubMedSearchUrl } from "@/lib/meta-analysis-pubmed";

export const runtime = "nodejs";

type CountRequest = {
  query?: unknown;
};

export async function POST(request: Request) {
  let payload: CountRequest;

  try {
    payload = (await request.json()) as CountRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof payload.query !== "string" || !payload.query.trim()) {
    return NextResponse.json({ error: "query must be a non-empty string." }, { status: 400 });
  }

  const query = payload.query.trim();
  const body = new URLSearchParams({
    db: "pubmed",
    retmode: "json",
    retmax: "5",
    term: query,
    usehistory: "y",
  });
  if (config.ncbiEmail) body.set("email", config.ncbiEmail);
  if (config.ncbiTool) body.set("tool", config.ncbiTool);
  if (config.ncbiApiKey) body.set("api_key", config.ncbiApiKey);

  const response = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": `${config.ncbiTool}/1.0 (${config.ncbiEmail || "no-email-configured"})`,
    },
    body,
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `NCBI request failed: ${response.status} ${response.statusText}` },
      { status: 502 },
    );
  }

  const result = (await response.json()) as {
    esearchresult?: {
      count?: string;
      idlist?: string[];
      translationset?: unknown[];
      querytranslation?: string;
      webenv?: string;
      querykey?: string;
      warninglist?: unknown;
      errorlist?: unknown;
    };
  };

  return NextResponse.json({
    count: Number(result.esearchresult?.count ?? 0),
    idList: result.esearchresult?.idlist ?? [],
    queryTranslation: result.esearchresult?.querytranslation ?? "",
    webEnv: result.esearchresult?.webenv ?? "",
    queryKey: result.esearchresult?.querykey ?? "",
    warningList: result.esearchresult?.warninglist ?? null,
    errorList: result.esearchresult?.errorlist ?? null,
    pubMedUrl: buildPubMedSearchUrl(query),
  });
}
