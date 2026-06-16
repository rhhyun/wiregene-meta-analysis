import { NextResponse } from "next/server";

import {
  getMetaProjectStorageSummary,
  readMetaProjectWorkspaceState,
  writeMetaProjectWorkspaceState,
} from "@/lib/meta-project-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

function statePatchFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  try {
    const [state, storage] = await Promise.all([
      readMetaProjectWorkspaceState(projectId),
      getMetaProjectStorageSummary(projectId),
    ]);
    return NextResponse.json({ state, storage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project workspace state could not be loaded." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const patch = statePatchFromPayload(await request.json().catch(() => null));
  if (!patch) return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });

  try {
    const state = await writeMetaProjectWorkspaceState(projectId, patch, { merge: true });
    const storage = await getMetaProjectStorageSummary(projectId);
    return NextResponse.json({ ok: true, state, storage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project workspace state could not be saved." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const nextState = statePatchFromPayload(await request.json().catch(() => null));
  if (!nextState) return NextResponse.json({ error: "A JSON object body is required." }, { status: 400 });

  try {
    const state = await writeMetaProjectWorkspaceState(projectId, nextState, { merge: false });
    const storage = await getMetaProjectStorageSummary(projectId);
    return NextResponse.json({ ok: true, state, storage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project workspace state could not be replaced." },
      { status: 400 },
    );
  }
}
