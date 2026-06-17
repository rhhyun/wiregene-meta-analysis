import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getMetaUserProjectsStorageSummary,
  readStoredMetaStudyProjects,
  writeStoredMetaStudyProjects,
} from "@/lib/meta-project-storage";
import type { MetaStudyProject } from "@/lib/meta-projects";

const projectSchema = z
  .object({
    id: z.string().min(1),
    shortTitle: z.string().min(1),
    title: z.string().min(1),
    visibility: z.enum(["active", "archived", "deleted"]).optional(),
    archivedAt: z.string().optional(),
    deletedAt: z.string().optional(),
    updatedAt: z.string().optional(),
    duplicateOf: z.string().optional(),
  })
  .passthrough();

const projectsSchema = z.object({
  projects: z.array(projectSchema).max(30),
});

export async function GET() {
  try {
    return NextResponse.json({
      projects: await readStoredMetaStudyProjects<MetaStudyProject>(),
      storage: getMetaUserProjectsStorageSummary(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Meta study projects could not be loaded.",
        storage: getMetaUserProjectsStorageSummary(),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const parsed = projectsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid meta study project payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const projects = await writeStoredMetaStudyProjects(
      parsed.data.projects as MetaStudyProject[],
    );
    return NextResponse.json({ ok: true, projects, storage: getMetaUserProjectsStorageSummary() });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Meta study projects could not be saved.",
        storage: getMetaUserProjectsStorageSummary(),
      },
      { status: 500 },
    );
  }
}
