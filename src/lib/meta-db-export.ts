import JSZip from "jszip";
import { getMetaAiSettingsSummary } from "./meta-ai-settings";
import {
  getMetaExtractionDatasetOverview,
  metaExtractionDatasetScope,
  type MetaExtractionDatasetOverview,
} from "./meta-extraction-dataset";
import { getMetaFullTextHistoryRecords, type MetaFullTextHistoryRecord } from "./meta-full-text-history";
import { cleanMetaProjectId } from "./meta-project-scope";
import {
  getMetaProjectStorageSummary,
  getMetaUserProjectsStorageSummary,
  readMetaProjectTextFile,
  readMetaProjectWorkspaceState,
  readStoredMetaStudyProjects,
  saveMetaProjectTextFile,
  type MetaProjectFileSummary,
  type MetaProjectStorageSummary,
  type MetaProjectWorkspaceState,
  type MetaUserProjectsStorageSummary,
} from "./meta-project-storage";

export type MetaDbExportInput = {
  projectId: string;
  extractionColumns?: string[] | null;
};

type ExportedProjectFile = MetaProjectFileSummary & {
  contents: string | null;
  skippedReason: string | null;
};

export type MetaDbExportSnapshot = {
  schemaVersion: "2026-06-20-meta-db-export-v1";
  exportedAt: string;
  projectId: string;
  fileBaseName: string;
  policy: {
    binaryFullTextIncluded: false;
    binaryFullTextPolicy: string;
    skippedSnapshotPolicy: string;
    maxSingleProjectTextFileBytes: number;
    maxTotalProjectTextFileBytes: number;
  };
  storage: {
    projectStorage: MetaProjectStorageSummary;
    userProjectsStorage: MetaUserProjectsStorageSummary;
    fullTextHistoryStorage: string;
    sourceFileStoragePolicy: string;
  };
  aiSettingsSummary: Awaited<ReturnType<typeof getMetaAiSettingsSummary>>;
  userProjects: unknown[];
  projectWorkspaceState: MetaProjectWorkspaceState;
  projectFiles: ExportedProjectFile[];
  fullTextHistory: MetaFullTextHistoryRecord[];
  extractionDataset: MetaExtractionDatasetOverview;
  warnings: string[];
};

const schemaVersion = "2026-06-20-meta-db-export-v1";
const maxSingleProjectTextFileBytes = 25 * 1024 * 1024;
const maxTotalProjectTextFileBytes = 80 * 1024 * 1024;

export async function createMetaDbExportSnapshot(input: MetaDbExportInput): Promise<MetaDbExportSnapshot> {
  const projectId = cleanMetaProjectId(input.projectId);
  if (!projectId) throw new Error("projectId is required for Meta DB export.");

  const warnings: string[] = [];
  const extractionScope = metaExtractionDatasetScope({
    projectId,
    extractionColumns: input.extractionColumns,
  });
  const [
    projectStorage,
    userProjectsStorage,
    aiSettingsSummary,
    userProjects,
    projectWorkspaceState,
    fullTextHistory,
    extractionDataset,
  ] = await Promise.all([
    getMetaProjectStorageSummary(projectId),
    Promise.resolve(getMetaUserProjectsStorageSummary()),
    getMetaAiSettingsSummary(),
    readStoredMetaStudyProjects().catch((error) => {
      warnings.push(`User project list could not be exported: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }),
    readMetaProjectWorkspaceState(projectId).catch((error) => {
      warnings.push(`Project workspace state could not be exported: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }),
    getMetaFullTextHistoryRecords({ projectId }).catch((error) => {
      warnings.push(`Full-text history could not be exported: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }),
    getMetaExtractionDatasetOverview(extractionScope).catch((error) => {
      warnings.push(`Extraction dataset could not be exported: ${error instanceof Error ? error.message : String(error)}`);
      return emptyExtractionDatasetOverview();
    }),
  ]);

  const projectFiles = await readProjectFilesForExport(projectId, projectStorage.files, warnings);

  return {
    schemaVersion,
    exportedAt: new Date().toISOString(),
    projectId,
    fileBaseName: exportBaseName(projectId),
    policy: {
      binaryFullTextIncluded: false,
      binaryFullTextPolicy:
        "PDF/Word full-text binaries are not embedded in DB export files. They remain in Synology/local storage or Google Drive and are tracked through sourceFile metadata in fullTextHistory.",
      skippedSnapshotPolicy:
        "Existing meta-db-snapshot files are skipped to prevent recursive snapshots and uncontrolled export growth.",
      maxSingleProjectTextFileBytes,
      maxTotalProjectTextFileBytes,
    },
    storage: {
      projectStorage,
      userProjectsStorage,
      fullTextHistoryStorage: "Project-scoped META_FULL_TEXT_HISTORY_STORAGE_BACKEND or inherited REPORT_STORAGE_BACKEND.",
      sourceFileStoragePolicy:
        "Full-text source files use META_FULL_TEXT_SOURCE_STORAGE_BACKEND. Export stores metadata only: storage type, fileName, size, sha256, localPath or driveFileId.",
    },
    aiSettingsSummary,
    userProjects,
    projectWorkspaceState,
    projectFiles,
    fullTextHistory,
    extractionDataset,
    warnings,
  };
}

export async function createMetaDbExportZip(input: MetaDbExportInput) {
  const snapshot = await createMetaDbExportSnapshot(input);
  const zip = new JSZip();
  const manifest = {
    ...snapshot,
    projectFiles: snapshot.projectFiles.map((file) => ({ ...file, contents: null })),
  };

  zip.file("README.md", exportReadme(snapshot));
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("project-workspace-state.json", JSON.stringify(snapshot.projectWorkspaceState, null, 2));
  zip.file("user-projects.json", JSON.stringify(snapshot.userProjects, null, 2));
  zip.file("ai-settings-summary.redacted.json", JSON.stringify(snapshot.aiSettingsSummary, null, 2));
  zip.file("full-text-history.json", JSON.stringify(snapshot.fullTextHistory, null, 2));
  zip.file("extraction-dataset.json", JSON.stringify(snapshot.extractionDataset, null, 2));
  zip.file("extraction-dataset.csv", snapshot.extractionDataset.csv || "");

  for (const file of snapshot.projectFiles) {
    if (file.contents == null) continue;
    zip.file(`project-files/${safeZipSegment(file.fileName)}`, file.contents);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    fileName: `${snapshot.fileBaseName}.zip`,
    buffer,
    snapshot,
  };
}

export async function saveMetaDbExportSnapshot(input: MetaDbExportInput) {
  const snapshot = await createMetaDbExportSnapshot(input);
  const savedFile = await saveMetaProjectTextFile({
    projectId: snapshot.projectId,
    fileName: `${snapshot.fileBaseName}.json`,
    contents: JSON.stringify(snapshot, null, 2),
  });
  return {
    savedFile,
    storage: await getMetaProjectStorageSummary(snapshot.projectId),
    snapshot: {
      fileBaseName: snapshot.fileBaseName,
      warnings: snapshot.warnings,
    },
  };
}

async function readProjectFilesForExport(
  projectId: string,
  files: MetaProjectFileSummary[],
  warnings: string[],
): Promise<ExportedProjectFile[]> {
  let totalBytes = 0;
  const exported: ExportedProjectFile[] = [];

  for (const file of files) {
    const skippedReason = skipProjectFileReason(file, totalBytes);
    if (skippedReason) {
      exported.push({ ...file, contents: null, skippedReason });
      continue;
    }

    try {
      const contents = await readMetaProjectTextFile(projectId, file.fileName);
      if (contents == null) {
        exported.push({ ...file, contents: null, skippedReason: "Project file was listed but could not be read." });
        continue;
      }
      totalBytes += Buffer.byteLength(contents, "utf8");
      exported.push({ ...file, contents, skippedReason: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Project file ${file.fileName} could not be exported: ${message}`);
      exported.push({ ...file, contents: null, skippedReason: message });
    }
  }

  return exported;
}

function skipProjectFileReason(file: MetaProjectFileSummary, currentTotalBytes: number) {
  if (/^meta-db-snapshot-/i.test(file.fileName)) return "Existing DB snapshot skipped to prevent recursive export growth.";
  if (file.bytes > maxSingleProjectTextFileBytes) {
    return `Project text file exceeds per-file export limit (${file.bytes} > ${maxSingleProjectTextFileBytes}).`;
  }
  if (currentTotalBytes + file.bytes > maxTotalProjectTextFileBytes) {
    return `Project text file skipped because total project-file export limit would exceed ${maxTotalProjectTextFileBytes} bytes.`;
  }
  return null;
}

function exportBaseName(projectId: string) {
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `meta-db-snapshot-${safeProjectId}-${stamp}`;
}

function safeZipSegment(value: string) {
  return value.replace(/[\\/]+/g, "-").replace(/^\.+/g, "").slice(0, 180) || "file.txt";
}

function exportReadme(snapshot: MetaDbExportSnapshot) {
  return [
    "# Wiregene Meta DB Export",
    "",
    `Exported at: ${snapshot.exportedAt}`,
    `Project id: ${snapshot.projectId}`,
    "",
    "Included:",
    "- manifest.json",
    "- project-workspace-state.json",
    "- user-projects.json",
    "- ai-settings-summary.redacted.json",
    "- full-text-history.json",
    "- extraction-dataset.json",
    "- extraction-dataset.csv",
    "- project-files/* for saved project text files included in the export limits",
    "",
    "Policy:",
    "- PDF/Word full-text binaries are not embedded in this bundle.",
    "- Source files remain in Synology/local storage or Google Drive.",
    "- full-text-history.json contains source-file metadata, checksums, paths, or Drive ids.",
    "- API keys are not exported; AI settings are redacted.",
    "",
    snapshot.warnings.length ? `Warnings:\n${snapshot.warnings.map((warning) => `- ${warning}`).join("\n")}` : "Warnings: none",
    "",
  ].join("\n");
}

function emptyExtractionDatasetOverview(): MetaExtractionDatasetOverview {
  return {
    columns: [],
    records: [],
    csv: "",
    stats: {
      includedRecordCount: 0,
      excelRowCount: 0,
      verifiedRowCount: 0,
      manualRequiredFieldCount: 0,
      evidenceBackedFieldCount: 0,
      autoFilledFieldCount: 0,
      blankFieldCount: 0,
      editableFieldCount: 0,
    },
    updatedAt: new Date().toISOString(),
  };
}
