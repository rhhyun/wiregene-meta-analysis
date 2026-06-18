import { NextResponse } from "next/server";
import {
  getMetaProjectStorageSummary,
  saveMetaProjectTextFile,
  parseRequestJson,
} from "@/lib/meta-project-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const storage = await getMetaProjectStorageSummary(projectId);
    return NextResponse.json({ storage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project storage could not be loaded." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const payload = await parseRequestJson(request).catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "JSON body is required." }, { status: 400 });
  }

  const fileName = (payload as { fileName?: unknown }).fileName;
  const contents = (payload as { contents?: unknown }).contents;
  if (typeof fileName !== "string" || typeof contents !== "string") {
    return NextResponse.json({ error: "fileName and contents must be strings." }, { status: 400 });
  }

  try {
    const savedFile = await saveMetaProjectTextFile({ projectId, fileName, contents });
    const storage = await getMetaProjectStorageSummary(projectId);
    return NextResponse.json({ savedFile, storage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project file could not be saved." },
      { status: 400 },
    );
  }
}
