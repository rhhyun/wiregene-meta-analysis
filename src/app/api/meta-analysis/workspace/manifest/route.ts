import { NextResponse } from "next/server";

import {
  getMetaUserProjectsStorageSummary,
  readStoredMetaStudyProjects,
} from "@/lib/meta-project-storage";
import { metaStudyProjects, metaStudyStages, type MetaStudyProject } from "@/lib/meta-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectManifest(project: MetaStudyProject) {
  return {
    id: project.id,
    shortTitle: project.shortTitle,
    title: project.title,
    researchQuestion: project.researchQuestion,
    stageCount: metaStudyStages.length,
    endpoints: {
      state: `/api/meta-analysis/projects/${encodeURIComponent(project.id)}/state`,
      files: `/api/meta-analysis/projects/${encodeURIComponent(project.id)}/files`,
    },
  };
}

export async function GET() {
  try {
    const userProjects = await readStoredMetaStudyProjects<MetaStudyProject>();
    const byId = new Map<string, MetaStudyProject>();
    for (const project of metaStudyProjects) byId.set(project.id, project);
    for (const project of userProjects) byId.set(project.id, project);

    return NextResponse.json({
      ok: true,
      app: "search.wiregene.com",
      generatedAt: new Date().toISOString(),
      projectRegistryStorage: getMetaUserProjectsStorageSummary(),
      integration: {
        stableProjectKey: "project.id",
        recommendedJoinKeys: ["project.id", "doi", "pmid", "record_id"],
        consumers: ["search.wiregene.com", "omni.wiregene.com", "portal.wiregene.com"],
      },
      endpoints: {
        projects: "/api/meta-analysis/projects",
        manifest: "/api/meta-analysis/workspace/manifest",
        projectStateTemplate: "/api/meta-analysis/projects/{projectId}/state",
        projectFilesTemplate: "/api/meta-analysis/projects/{projectId}/files",
        projectFileDownloadTemplate: "/api/meta-analysis/projects/{projectId}/files/{fileName}",
      },
      projects: Array.from(byId.values()).map(projectManifest),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta workspace manifest could not be loaded." },
      { status: 500 },
    );
  }
}
