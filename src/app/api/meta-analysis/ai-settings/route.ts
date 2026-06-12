import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWiregeneUser } from "@/lib/auth-session";
import { getMetaAiSettingsSummary, updateMetaAiSettings } from "@/lib/meta-ai-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  modelName: z.string().trim().min(1).max(120).optional(),
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(),
});

export async function GET(request: Request) {
  const user = await requireMetaAdmin(request);
  if (!user.ok) return user.response;

  try {
    const settings = await getMetaAiSettingsSummary();
    return NextResponse.json(
      { settings },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return settingsErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const user = await requireMetaAdmin(request);
  if (!user.ok) return user.response;

  try {
    const payload = updateSchema.parse(await request.json());
    const settings = await updateMetaAiSettings({
      ...payload,
      updatedBy: user.username,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}

async function requireMetaAdmin(request: Request) {
  const currentUser = await getCurrentWiregeneUser(request.headers.get("authorization"), {
    mode: "meta",
  });

  if (!currentUser?.isAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Meta administrator permission is required." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    username: currentUser.username,
  };
}

function settingsErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid AI settings payload.", details: error.flatten() }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "AI settings operation failed.",
    },
    { status: 400 },
  );
}
