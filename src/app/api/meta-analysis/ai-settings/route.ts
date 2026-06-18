import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWiregeneUser } from "@/lib/auth-session";
import { getMetaAiSettingsSummary, metaAiSettingsErrorDetails, updateMetaAiSettings } from "@/lib/meta-ai-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  modelName: z.string().trim().min(1).max(120).optional(),
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional(),
  modelReviewers: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80).optional(),
        label: z.string().trim().min(1).max(80).optional(),
        providerType: z.enum(["OPENAI", "OPENAI_COMPATIBLE"]).optional(),
        enabled: z.boolean().optional(),
        modelName: z.string().trim().min(1).max(120).optional(),
        baseUrl: z.string().trim().max(240).nullable().optional(),
        apiKey: z.string().optional(),
        clearApiKey: z.boolean().optional(),
      }),
    )
    .max(3)
    .optional(),
});

export async function GET(request: Request) {
  const user = await requireMetaUser(request);
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
  const user = await requireMetaUser(request);
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

async function requireMetaUser(request: Request) {
  const currentUser = await getCurrentWiregeneUser(request.headers.get("authorization"), {
    mode: "meta",
  });

  if (!currentUser) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Meta login is required." }, { status: 401 }),
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
      details: metaAiSettingsErrorDetails(error),
    },
    { status: 400 },
  );
}
