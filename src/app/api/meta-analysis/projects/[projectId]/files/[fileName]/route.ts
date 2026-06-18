import { NextResponse } from "next/server";

import { readMetaProjectTextFile } from "@/lib/meta-project-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string; fileName: string }>;
};

function contentTypeForFile(fileName: string) {
  if (fileName.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (fileName.endsWith(".tsv")) return "text/tab-separated-values; charset=utf-8";
  if (fileName.endsWith(".json")) return "application/json; charset=utf-8";
  if (fileName.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId, fileName } = await context.params;

  try {
    const contents = await readMetaProjectTextFile(projectId, fileName);
    if (contents === null) {
      return NextResponse.json({ error: "Project file was not found." }, { status: 404 });
    }

    return new Response(contents, {
      headers: {
        "content-disposition": `attachment; filename="${fileName.replaceAll('"', "")}"`,
        "content-type": contentTypeForFile(fileName),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project file could not be downloaded." },
      { status: 400 },
    );
  }
}
