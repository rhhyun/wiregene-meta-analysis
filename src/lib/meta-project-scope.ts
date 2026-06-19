const defaultProjectDrivePrefix = "meta-projects";
const defaultProjectStorageRoot = ".data/meta/projects";

export type MetaProjectScope = {
  projectId?: string | null;
};

export function cleanMetaProjectId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

export function safeMetaProjectFolder(projectId: string) {
  const cleaned = projectId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return cleaned || "project";
}

export function metaProjectScopedLocalPath(projectId: string, ...segments: string[]) {
  return [projectStorageRoot(), safeMetaProjectFolder(projectId), ...segments.map(cleanPathSegment)]
    .filter(Boolean)
    .join("/");
}

export function metaProjectScopedDriveFileName(projectId: string, fileName: string) {
  return `${projectDrivePrefix()}__${safeMetaProjectFolder(projectId)}__${safeScopedFileName(fileName)}`;
}

function projectDrivePrefix() {
  return (process.env.META_PROJECT_DRIVE_PREFIX?.trim() || defaultProjectDrivePrefix)
    .replace(/[/\\]+/g, "-")
    .replace(/^-+|-+$/g, "") || defaultProjectDrivePrefix;
}

function safeScopedFileName(fileName: string) {
  const baseName = cleanPathSegment(fileName).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
  return baseName && baseName !== "." && baseName !== ".." ? baseName : "file";
}

function projectStorageRoot() {
  return trimPathSlashes(process.env.META_PROJECT_STORAGE_ROOT?.trim() || defaultProjectStorageRoot);
}

function cleanPathSegment(value: string) {
  return trimPathSlashes(value.trim().split(/[\\/]+/).filter(Boolean).at(-1) ?? "");
}

function trimPathSlashes(value: string) {
  return value.replace(/[\\/]+$/g, "");
}
