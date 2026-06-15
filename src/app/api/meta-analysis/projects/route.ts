import { NextResponse } from "next/server";
import { z } from "zod";

import {
  readStoredMetaStudyProjects,
  writeStoredMetaStudyProjects,
} from "@/lib/meta-project-storage";
import type { MetaStudyProject } from "@/lib/meta-projects";

const projectSchema = z
  .object({
    id: z.string().min(1),
    shortTitle: z.string().min(1),
    title: z.string().min(1),
  })
  .passthrough();

const projectsSchema = z.object({
  projects: z.array(projectSchema).max(30),
});

export async function GET() {
  return NextResponse.json({
    projects: await readStoredMetaStudyProjects<MetaStudyProject>(),
  });
}

export async function PUT(request: Request) {
  const parsed = projectsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid meta study project payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const projects = await writeStoredMetaStudyProjects(
    parsed.data.projects as MetaStudyProject[],
  );
  return NextResponse.json({ ok: true, projects });
}
